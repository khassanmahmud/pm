import os
from pathlib import Path

import pytest
from dotenv import load_dotenv
from fastapi.testclient import TestClient

from app.main import app

load_dotenv(Path(__file__).parents[2] / ".env")



def live(test):
    """Mark a test that calls the real AI; skipped without a key, deselect with -m 'not live'."""
    skip = pytest.mark.skipif(not os.environ.get("OPENROUTER_API_KEY"), reason="OPENROUTER_API_KEY not set")
    return pytest.mark.live(skip(test))


@pytest.fixture(autouse=True)
def db_path(tmp_path, monkeypatch):
    path = tmp_path / "data" / "test.db"
    monkeypatch.setenv("DB_PATH", str(path))
    return path


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def sign_in(c: TestClient, username="user", password="password"):
    return c.post("/api/login", json={"username": username, "password": password})
