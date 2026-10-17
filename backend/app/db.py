import os
import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path

from app.models import Board

DEFAULT_DB_PATH = Path(__file__).parents[1] / "data" / "pm.db"
DEFAULT_BOARD = (Path(__file__).parent / "default_board.json").read_text()

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS boards (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
"""


def db_path() -> Path:
    return Path(os.environ.get("DB_PATH", DEFAULT_DB_PATH))


@contextmanager
def connect():
    conn = sqlite3.connect(db_path())
    try:
        with conn:
            yield conn
    finally:
        conn.close()


def init_db():
    db_path().parent.mkdir(parents=True, exist_ok=True)
    with connect() as conn:
        conn.executescript(SCHEMA)


def _user_id(conn: sqlite3.Connection, username: str) -> int:
    conn.execute("INSERT OR IGNORE INTO users (username) VALUES (?)", (username,))
    return conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()[0]


def _save(conn: sqlite3.Connection, user_id: int, data: str):
    conn.execute(
        """INSERT INTO boards (user_id, data, updated_at) VALUES (?, ?, ?)
           ON CONFLICT (user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at""",
        (user_id, data, datetime.now(UTC).isoformat()),
    )


def get_board(username: str) -> Board:
    with connect() as conn:
        user_id = _user_id(conn, username)
        row = conn.execute("SELECT data FROM boards WHERE user_id = ?", (user_id,)).fetchone()
        if row:
            return Board.model_validate_json(row[0])
        _save(conn, user_id, DEFAULT_BOARD)
        return Board.model_validate_json(DEFAULT_BOARD)


def save_board(username: str, board: Board):
    with connect() as conn:
        _save(conn, _user_id(conn, username), board.model_dump_json())
