import json
import os
from pathlib import Path

import pytest
from dotenv import load_dotenv
from fastapi.testclient import TestClient

from app import auth
from app.db import DEFAULT_BOARD
from app.main import app

load_dotenv(Path(__file__).parents[2] / ".env")

DEFAULT = json.loads(DEFAULT_BOARD)


def live(test):
    """Mark a test that calls the real AI; skipped without a key, deselect with -m 'not live'."""
    skip = pytest.mark.skipif(not os.environ.get("OPENROUTER_API_KEY"), reason="OPENROUTER_API_KEY not set")
    return pytest.mark.live(skip(test))


@pytest.fixture(autouse=True)
def db_path(tmp_path, monkeypatch):
    path = tmp_path / "data" / "test.db"
    monkeypatch.setenv("DB_PATH", str(path))
    return path


@pytest.fixture(autouse=True)
def fast_hashing(monkeypatch):
    # Real scrypt cost makes every sign-in slow; the algorithm is unchanged.
    monkeypatch.setitem(auth.SCRYPT, "n", 2**4)


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def signed_in(client):
    sign_in(client)
    return client


@pytest.fixture
def board_id(signed_in):
    """Id of the demo user's default board."""
    return signed_in.get("/api/boards").json()[0]["id"]


def sign_in(c: TestClient, username="user", password="password"):
    return c.post("/api/login", json={"username": username, "password": password})


def register(c: TestClient, username="alice", password="alice-password"):
    return c.post("/api/register", json={"username": username, "password": password})
