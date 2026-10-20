import os
import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path

from app.auth import hash_password, verify_password
from app.models import DEFAULT_BOARD, Board, BoardSummary

DEFAULT_DB_PATH = Path(__file__).parents[1] / "data" / "pm.db"
DEFAULT_BOARD_NAME = "Product Launch"
DEMO_USER = ("user", "password")
SCHEMA_VERSION = 1

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS boards (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS boards_user_id ON boards(user_id);
"""


# Version 0 (the MVP) had users without passwords and one board per user (boards.user_id UNIQUE, no name).
def migrate_v0() -> str:
    return f"""
ALTER TABLE boards RENAME TO boards_v0;
ALTER TABLE users RENAME TO users_v0;
{SCHEMA}
INSERT INTO users (id, username, password_hash, created_at) SELECT id, username, '', '{now()}' FROM users_v0;
INSERT INTO boards (id, user_id, name, data, created_at, updated_at)
  SELECT id, user_id, '{DEFAULT_BOARD_NAME}', data, updated_at, updated_at FROM boards_v0;
DROP TABLE boards_v0;
DROP TABLE users_v0;
"""


SUMMARY = """SELECT id, name, (SELECT COUNT(*) FROM json_each(data, '$.cards')), updated_at FROM boards"""


class UsernameTaken(Exception):
    pass


def db_path() -> Path:
    return Path(os.environ.get("DB_PATH", DEFAULT_DB_PATH))


def now() -> str:
    return datetime.now(UTC).isoformat()


@contextmanager
def connect():
    conn = sqlite3.connect(db_path())
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        with conn:
            yield conn
    finally:
        conn.close()


def init_db():
    db_path().parent.mkdir(parents=True, exist_ok=True)
    with connect() as conn:
        version = conn.execute("PRAGMA user_version").fetchone()[0]
        legacy = conn.execute("SELECT 1 FROM sqlite_master WHERE name = 'users'").fetchone()
        script = migrate_v0() if version == 0 and legacy else SCHEMA
        # One transaction; foreign keys off while tables are rebuilt (the pragma is ignored inside a transaction).
        conn.executescript(
            f"PRAGMA foreign_keys = OFF; BEGIN; {script}; PRAGMA user_version = {SCHEMA_VERSION}; COMMIT;"
            " PRAGMA foreign_keys = ON;"
        )
    ensure_demo_user()


def ensure_demo_user():
    """The demo account always exists; migrated MVP databases have it without a password."""
    username, password = DEMO_USER
    with connect() as conn:
        row = conn.execute("SELECT id, password_hash FROM users WHERE username = ?", (username,)).fetchone()
        if row and not row[1]:
            conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hash_password(password), row[0]))
    if not row:
        create_user(username, password)


def _summary(row) -> BoardSummary:
    return BoardSummary(id=row[0], name=row[1], cardCount=row[2], updatedAt=row[3])


# Users


def create_user(username: str, password: str) -> int:
    """Create a user with the default board. Raises UsernameTaken."""
    with connect() as conn:
        try:
            user_id = conn.execute(
                "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
                (username, hash_password(password), now()),
            ).lastrowid
        except sqlite3.IntegrityError:
            raise UsernameTaken(username) from None
        _insert_board(conn, user_id, DEFAULT_BOARD_NAME, DEFAULT_BOARD)
    return user_id


def authenticate(username: str, password: str) -> tuple[int, str] | None:
    """Return (id, username) if the password matches."""
    with connect() as conn:
        row = conn.execute("SELECT id, username, password_hash FROM users WHERE username = ?", (username,)).fetchone()
    if row and verify_password(password, row[2]):
        return row[0], row[1]
    return None


def get_username(user_id: int) -> str | None:
    with connect() as conn:
        row = conn.execute("SELECT username FROM users WHERE id = ?", (user_id,)).fetchone()
    return row and row[0]


def check_password(user_id: int, password: str) -> bool:
    with connect() as conn:
        row = conn.execute("SELECT password_hash FROM users WHERE id = ?", (user_id,)).fetchone()
    return bool(row) and verify_password(password, row[0])


def set_password(user_id: int, password: str):
    with connect() as conn:
        conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hash_password(password), user_id))


def delete_user(user_id: int):
    with connect() as conn:
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))


# Boards


def _insert_board(conn: sqlite3.Connection, user_id: int, name: str, board: Board) -> int:
    ts = now()
    return conn.execute(
        "INSERT INTO boards (user_id, name, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        (user_id, name, board.model_dump_json(), ts, ts),
    ).lastrowid


def list_boards(user_id: int) -> list[BoardSummary]:
    with connect() as conn:
        rows = conn.execute(f"{SUMMARY} WHERE user_id = ? ORDER BY id", (user_id,)).fetchall()
    return [_summary(r) for r in rows]


def board_summary(user_id: int, board_id: int) -> BoardSummary | None:
    with connect() as conn:
        row = conn.execute(f"{SUMMARY} WHERE user_id = ? AND id = ?", (user_id, board_id)).fetchone()
    return row and _summary(row)


def create_board(user_id: int, name: str, board: Board) -> BoardSummary:
    with connect() as conn:
        board_id = _insert_board(conn, user_id, name, board)
    return board_summary(user_id, board_id)


def get_board(user_id: int, board_id: int) -> Board | None:
    with connect() as conn:
        row = conn.execute("SELECT data FROM boards WHERE user_id = ? AND id = ?", (user_id, board_id)).fetchone()
    return row and Board.model_validate_json(row[0])


def save_board(user_id: int, board_id: int, board: Board) -> bool:
    with connect() as conn:
        cursor = conn.execute(
            "UPDATE boards SET data = ?, updated_at = ? WHERE user_id = ? AND id = ?",
            (board.model_dump_json(), now(), user_id, board_id),
        )
    return cursor.rowcount == 1


def rename_board(user_id: int, board_id: int, name: str) -> BoardSummary | None:
    with connect() as conn:
        conn.execute(
            "UPDATE boards SET name = ?, updated_at = ? WHERE user_id = ? AND id = ?", (name, now(), user_id, board_id)
        )
    return board_summary(user_id, board_id)


def delete_board(user_id: int, board_id: int) -> bool:
    with connect() as conn:
        cursor = conn.execute("DELETE FROM boards WHERE user_id = ? AND id = ?", (user_id, board_id))
    return cursor.rowcount == 1
