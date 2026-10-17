import json
import sqlite3
from contextlib import closing
from copy import deepcopy

import pytest
from fastapi.testclient import TestClient

from app import main
from app.db import DEFAULT_BOARD
from app.main import app
from conftest import sign_in

DEFAULT = json.loads(DEFAULT_BOARD)


def board_with(**changes):
    board = deepcopy(DEFAULT)
    board.update(changes)
    return board


def query(db_path, sql):
    with closing(sqlite3.connect(db_path)) as conn:
        return conn.execute(sql).fetchall()


@pytest.fixture
def signed_in(client):
    sign_in(client)
    return client


def test_db_created_on_startup(db_path):
    assert not db_path.exists()
    with TestClient(app):
        pass
    assert db_path.exists()
    tables = {r[0] for r in query(db_path, "SELECT name FROM sqlite_master WHERE type='table'")}
    assert {"users", "boards"} <= tables


def test_board_requires_sign_in(client):
    assert client.get("/api/board").status_code == 401
    assert client.put("/api/board", json=DEFAULT).status_code == 401


def test_default_board_seeded(signed_in, db_path):
    response = signed_in.get("/api/board")
    assert response.status_code == 200
    assert response.json() == DEFAULT
    assert query(db_path, "SELECT username FROM users") == [("user",)]
    assert query(db_path, "SELECT COUNT(*) FROM boards") == [(1,)]


def test_put_then_get_round_trips(signed_in):
    board = deepcopy(DEFAULT)
    board["columns"][0]["title"] = "Ideas"
    board["cards"]["c1"]["title"] = "Renamed card"
    board["columns"][0]["cardIds"].remove("c1")
    board["columns"][4]["cardIds"].insert(0, "c1")
    assert signed_in.put("/api/board", json=board).json() == board
    assert signed_in.get("/api/board").json() == board


def test_put_overwrites_single_row(signed_in, db_path):
    signed_in.get("/api/board")
    signed_in.put("/api/board", json=DEFAULT)
    signed_in.put("/api/board", json=DEFAULT)
    assert query(db_path, "SELECT COUNT(*) FROM boards") == [(1,)]


def test_empty_board_allowed(signed_in):
    board = board_with(cards={}, columns=[{**c, "cardIds": []} for c in DEFAULT["columns"]])
    assert signed_in.put("/api/board", json=board).status_code == 200
    assert signed_in.get("/api/board").json() == board


def test_board_persists_across_restart(db_path):
    board = deepcopy(DEFAULT)
    board["columns"][1]["title"] = "Next"
    with TestClient(app) as c:
        sign_in(c)
        c.put("/api/board", json=board)
    with TestClient(app) as c:
        sign_in(c)
        assert c.get("/api/board").json() == board


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
    ],
)
def test_invalid_board_rejected(signed_in, mutate):
    board = deepcopy(DEFAULT)
    mutate(board)
    assert signed_in.put("/api/board", json=board).status_code == 422
    assert signed_in.get("/api/board").json() == DEFAULT


def test_boards_isolated_per_user(monkeypatch):
    monkeypatch.setitem(main.USERS, "other", "secret")
    board = deepcopy(DEFAULT)
    board["columns"][0]["title"] = "Mine"
    with TestClient(app) as a, TestClient(app) as b:
        sign_in(a)
        sign_in(b, "other", "secret")
        a.put("/api/board", json=board)
        assert b.get("/api/board").json() == DEFAULT
        assert a.get("/api/board").json() == board
