import json
import sqlite3
from contextlib import closing
from copy import deepcopy

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models import EMPTY_BOARD
from conftest import DEFAULT, register, sign_in

EMPTY = EMPTY_BOARD.model_dump()


def query(db_path, sql, params=()):
    with closing(sqlite3.connect(db_path)) as conn:
        return conn.execute(sql, params).fetchall()


def url(board_id, suffix=""):
    return f"/api/boards/{board_id}{suffix}"


def test_db_created_on_startup(db_path):
    assert not db_path.exists()
    with TestClient(app):
        pass
    assert db_path.exists()
    tables = {r[0] for r in query(db_path, "SELECT name FROM sqlite_master WHERE type='table'")}
    assert {"users", "boards"} <= tables
    assert query(db_path, "PRAGMA user_version") == [(1,)]


def test_demo_user_seeded_with_default_board(client, db_path):
    assert query(db_path, "SELECT username FROM users") == [("user",)]
    assert query(db_path, "SELECT name FROM boards") == [("Product Launch",)]


def test_startup_is_idempotent(db_path):
    for _ in range(2):
        with TestClient(app):
            pass
    assert query(db_path, "SELECT COUNT(*) FROM users") == [(1,)]
    assert query(db_path, "SELECT COUNT(*) FROM boards") == [(1,)]


def test_passwords_are_not_stored_in_plain_text(client, db_path):
    register(client, "alice", "alice-password")
    hashes = [r[0] for r in query(db_path, "SELECT password_hash FROM users")]
    assert all(h.startswith("scrypt$") for h in hashes)
    assert not any("password" in h for h in hashes)


@pytest.mark.parametrize(
    "method,path",
    [("get", "/api/boards"), ("post", "/api/boards"), ("get", url(1)), ("put", url(1)), ("patch", url(1)),
     ("delete", url(1)), ("post", url(1, "/chat"))],
)
def test_board_routes_require_sign_in(client, method, path):
    assert client.request(method, path, json={}).status_code == 401


def test_list_boards(signed_in, board_id):
    [summary] = signed_in.get("/api/boards").json()
    assert summary["id"] == board_id
    assert summary["name"] == "Product Launch"
    assert summary["cardCount"] == 10
    assert summary["updatedAt"]


def test_get_default_board(signed_in, board_id):
    response = signed_in.get(url(board_id))
    assert response.status_code == 200
    assert response.json() == DEFAULT


def test_new_user_gets_default_board(client):
    register(client)
    [summary] = client.get("/api/boards").json()
    assert summary["name"] == "Product Launch"
    assert client.get(url(summary["id"])).json() == DEFAULT


def test_create_empty_board(signed_in):
    response = signed_in.post("/api/boards", json={"name": "  Website  "})
    assert response.status_code == 201
    created = response.json()
    assert created["name"] == "Website"
    assert created["cardCount"] == 0
    assert signed_in.get(url(created["id"])).json() == EMPTY
    assert [b["name"] for b in signed_in.get("/api/boards").json()] == ["Product Launch", "Website"]


def test_create_board_from_sample(signed_in):
    created = signed_in.post("/api/boards", json={"name": "Copy", "sample": True}).json()
    assert created["cardCount"] == 10
    assert signed_in.get(url(created["id"])).json() == DEFAULT


@pytest.mark.parametrize("name", ["", "   ", "x" * 81])
def test_create_board_rejects_bad_name(signed_in, name):
    assert signed_in.post("/api/boards", json={"name": name}).status_code == 422


def test_rename_board(signed_in, board_id):
    response = signed_in.patch(url(board_id), json={"name": "Launch v2"})
    assert response.status_code == 200
    assert response.json()["name"] == "Launch v2"
    assert signed_in.get("/api/boards").json()[0]["name"] == "Launch v2"
    # Renaming leaves the board itself alone.
    assert signed_in.get(url(board_id)).json() == DEFAULT


def test_rename_board_rejects_blank_name(signed_in, board_id):
    assert signed_in.patch(url(board_id), json={"name": " "}).status_code == 422


def test_delete_board(signed_in, board_id):
    other = signed_in.post("/api/boards", json={"name": "Other"}).json()
    assert signed_in.delete(url(board_id)).status_code == 204
    assert [b["id"] for b in signed_in.get("/api/boards").json()] == [other["id"]]
    assert signed_in.get(url(board_id)).status_code == 404


def test_delete_last_board_leaves_empty_list(signed_in, board_id):
    signed_in.delete(url(board_id))
    assert signed_in.get("/api/boards").json() == []


def test_missing_board_is_404(signed_in):
    assert signed_in.get(url(999)).status_code == 404
    assert signed_in.put(url(999), json=DEFAULT).status_code == 404
    assert signed_in.patch(url(999), json={"name": "x"}).status_code == 404
    assert signed_in.delete(url(999)).status_code == 404


def test_put_then_get_round_trips(signed_in, board_id):
    board = deepcopy(DEFAULT)
    board["columns"][0]["title"] = "Ideas"
    board["cards"]["c1"].update(title="Renamed card", priority="high", dueDate="2026-12-31", labels=["a", "b"])
    board["columns"][0]["cardIds"].remove("c1")
    board["columns"][4]["cardIds"].insert(0, "c1")
    assert signed_in.put(url(board_id), json=board).json() == board
    assert signed_in.get(url(board_id)).json() == board


def test_put_updates_summary(signed_in, board_id):
    before = signed_in.get("/api/boards").json()[0]
    board = deepcopy(DEFAULT)
    board["columns"][0]["cardIds"].remove("c1")
    del board["cards"]["c1"]
    signed_in.put(url(board_id), json=board)
    after = signed_in.get("/api/boards").json()[0]
    assert after["cardCount"] == 9
    assert after["updatedAt"] > before["updatedAt"]


def test_card_optional_fields_default(signed_in, board_id):
    """Cards saved without the optional fields (as the MVP stored them) still load."""
    board = deepcopy(DEFAULT)
    board["cards"]["c1"] = {"id": "c1", "title": "Plain", "details": ""}
    signed_in.put(url(board_id), json=board)
    card = signed_in.get(url(board_id)).json()["cards"]["c1"]
    assert card == {"id": "c1", "title": "Plain", "details": "", "priority": None, "dueDate": None, "labels": []}


def test_empty_board_allowed(signed_in, board_id):
    assert signed_in.put(url(board_id), json=EMPTY).status_code == 200
    assert signed_in.get(url(board_id)).json() == EMPTY


def test_board_persists_across_restart(db_path):
    board = deepcopy(DEFAULT)
    board["columns"][1]["title"] = "Next"
    with TestClient(app) as c:
        sign_in(c)
        board_id = c.get("/api/boards").json()[0]["id"]
        c.put(url(board_id), json=board)
    with TestClient(app) as c:
        sign_in(c)
        assert c.get(url(board_id)).json() == board


@pytest.mark.parametrize(
    "mutate",
    [
        pytest.param(lambda b: b["columns"].pop(), id="missing column"),
        pytest.param(lambda b: b["columns"].append({"id": "extra", "title": "X", "cardIds": []}), id="extra column"),
        pytest.param(lambda b: b["columns"].reverse(), id="columns reordered"),
        pytest.param(lambda b: b["columns"][0].update(id="ideas"), id="column id changed"),
        pytest.param(lambda b: b["columns"][1]["cardIds"].append("c1"), id="card in two columns"),
        pytest.param(lambda b: b["columns"][0]["cardIds"].append("ghost"), id="unknown card id"),
        pytest.param(lambda b: b["columns"][0]["cardIds"].remove("c1"), id="orphan card"),
        pytest.param(lambda b: b["cards"]["c1"].update(id="c99"), id="card id mismatch"),
        pytest.param(lambda b: b["cards"]["c1"].pop("title"), id="card missing field"),
        pytest.param(lambda b: b["cards"]["c1"].update(priority="urgent"), id="unknown priority"),
        pytest.param(lambda b: b["cards"]["c1"].update(dueDate="next week"), id="bad due date"),
        pytest.param(lambda b: b["cards"]["c1"].update(dueDate="2026-02-30"), id="impossible due date"),
    ],
)
def test_invalid_board_rejected(signed_in, board_id, mutate):
    board = deepcopy(DEFAULT)
    mutate(board)
    assert signed_in.put(url(board_id), json=board).status_code == 422
    assert signed_in.get(url(board_id)).json() == DEFAULT


def test_boards_isolated_per_user(client):
    with TestClient(app) as other:
        sign_in(client)
        register(other)
        mine = client.get("/api/boards").json()[0]["id"]
        theirs = other.get("/api/boards").json()[0]["id"]
        assert mine != theirs
        board = deepcopy(DEFAULT)
        board["columns"][0]["title"] = "Mine"
        client.put(url(mine), json=board)
        assert other.get(url(theirs)).json() == DEFAULT
        assert [b["id"] for b in other.get("/api/boards").json()] == [theirs]


def test_cannot_access_another_users_board(client):
    with TestClient(app) as other:
        sign_in(client)
        register(other)
        mine = client.get("/api/boards").json()[0]["id"]
        assert other.get(url(mine)).status_code == 404
        assert other.put(url(mine), json=DEFAULT).status_code == 404
        assert other.patch(url(mine), json={"name": "Hijacked"}).status_code == 404
        assert other.delete(url(mine)).status_code == 404
        assert other.post(url(mine, "/chat"), json={"message": "hi"}).status_code == 404
        assert client.get("/api/boards").json()[0]["name"] == "Product Launch"


def test_deleting_account_deletes_boards(client, db_path):
    register(client)
    client.post("/api/boards", json={"name": "Second"})
    client.request("DELETE", "/api/account", json={"password": "alice-password"})
    assert query(db_path, "SELECT COUNT(*) FROM boards") == [(1,)]  # only the demo user's board remains


# Migration from the MVP schema


def create_v0_db(db_path, board_json):
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(db_path)) as conn, conn:
        conn.executescript("""
            CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE);
            CREATE TABLE boards (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
                                 data TEXT NOT NULL, updated_at TEXT NOT NULL);
            INSERT INTO users (id, username) VALUES (1, 'user'), (2, 'other');
        """)
        conn.executemany(
            "INSERT INTO boards (user_id, data, updated_at) VALUES (?, ?, '2026-01-01T00:00:00+00:00')",
            [(1, board_json), (2, board_json)],
        )


def test_migrates_mvp_database(db_path):
    board = deepcopy(DEFAULT)
    for card in board["cards"].values():
        del card["priority"], card["dueDate"], card["labels"]
    board["columns"][0]["title"] = "Migrated"
    create_v0_db(db_path, json.dumps(board))
    with TestClient(app) as c:
        assert sign_in(c).status_code == 200
        [summary] = c.get("/api/boards").json()
        assert summary["name"] == "Product Launch"
        assert summary["updatedAt"] == "2026-01-01T00:00:00+00:00"
        migrated = c.get(url(summary["id"])).json()
        assert migrated["columns"][0]["title"] == "Migrated"
        assert migrated["cards"]["c1"]["labels"] == []
        # Users other than the demo user had no password and cannot sign in.
        assert sign_in(c, "other", "").status_code == 401
    assert query(db_path, "PRAGMA user_version") == [(1,)]
    assert query(db_path, "SELECT COUNT(*) FROM boards") == [(2,)]
    tables = {r[0] for r in query(db_path, "SELECT name FROM sqlite_master WHERE type='table'")}
    assert tables == {"users", "boards"}
    # Boards are no longer unique per user.
    with TestClient(app) as c:
        sign_in(c)
        c.post("/api/boards", json={"name": "Second"})
        assert len(c.get("/api/boards").json()) == 2
