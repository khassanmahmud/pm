import pytest
from fastapi.testclient import TestClient

from app import auth
from app.main import app
from conftest import register, sign_in


def test_me_requires_sign_in(client):
    assert client.get("/api/me").status_code == 401


def test_login_success_sets_session(client):
    response = sign_in(client)
    assert response.status_code == 200
    assert response.json() == {"username": "user"}
    assert "session" in response.cookies
    assert client.get("/api/me").json() == {"username": "user"}


def test_session_cookie_is_httponly_and_samesite_strict(client):
    cookie = sign_in(client).headers["set-cookie"].lower()
    assert "httponly" in cookie
    assert "samesite=strict" in cookie


def test_login_wrong_password(client):
    response = sign_in(client, password="wrong")
    assert response.status_code == 401
    assert client.get("/api/me").status_code == 401


def test_login_unknown_user(client):
    assert sign_in(client, username="admin").status_code == 401


def test_login_is_case_insensitive_for_username(client):
    assert sign_in(client, username="USER").json() == {"username": "user"}


def test_login_missing_fields(client):
    assert client.post("/api/login", json={"username": "user"}).status_code == 422


def test_logout_clears_session(client):
    sign_in(client)
    assert client.post("/api/logout").status_code == 200
    assert client.get("/api/me").status_code == 401


def test_tampered_cookie_rejected(client):
    client.cookies.set("session", "forged-value")
    assert client.get("/api/me").status_code == 401


# Registration


def test_register_signs_in(client):
    response = register(client)
    assert response.status_code == 201
    assert response.json() == {"username": "alice"}
    assert client.get("/api/me").json() == {"username": "alice"}


def test_registered_user_can_sign_in_later(client):
    register(client)
    client.post("/api/logout")
    assert sign_in(client, "alice", "alice-password").status_code == 200
    assert sign_in(client, "alice", "wrong-password").status_code == 401


def test_register_trims_username(client):
    assert register(client, username="  bob  ").json() == {"username": "bob"}


def test_register_duplicate_username(client):
    register(client)
    assert register(client).status_code == 409
    assert register(client, username="ALICE").status_code == 409


def test_register_cannot_take_demo_username(client):
    assert register(client, username="user").status_code == 409


@pytest.mark.parametrize(
    "username,password",
    [
        pytest.param("ab", "long-enough", id="username too short"),
        pytest.param("a" * 33, "long-enough", id="username too long"),
        pytest.param("bad name", "long-enough", id="username with space"),
        pytest.param("bad/name", "long-enough", id="username with slash"),
        pytest.param("carol", "short", id="password too short"),
        pytest.param("carol", "x" * 129, id="password too long"),
    ],
)
def test_register_validation(client, username, password):
    assert register(client, username=username, password=password).status_code == 422
    assert client.get("/api/me").status_code == 401


def test_register_replaces_existing_session(client):
    sign_in(client)
    register(client)
    assert client.get("/api/me").json() == {"username": "alice"}


# Account


def test_change_password(client):
    register(client)
    response = client.post(
        "/api/account/password", json={"currentPassword": "alice-password", "newPassword": "new-password"}
    )
    assert response.status_code == 200
    client.post("/api/logout")
    assert sign_in(client, "alice", "alice-password").status_code == 401
    assert sign_in(client, "alice", "new-password").status_code == 200


def test_change_password_requires_current_password(client):
    register(client)
    response = client.post("/api/account/password", json={"currentPassword": "wrong", "newPassword": "new-password"})
    assert response.status_code == 403
    client.post("/api/logout")
    assert sign_in(client, "alice", "alice-password").status_code == 200


def test_change_password_validates_new_password(client):
    register(client)
    response = client.post("/api/account/password", json={"currentPassword": "alice-password", "newPassword": "short"})
    assert response.status_code == 422


def test_change_password_requires_sign_in(client):
    response = client.post("/api/account/password", json={"currentPassword": "a", "newPassword": "new-password"})
    assert response.status_code == 401


def test_delete_account(client):
    register(client)
    response = client.request("DELETE", "/api/account", json={"password": "alice-password"})
    assert response.status_code == 204
    assert client.get("/api/me").status_code == 401
    assert sign_in(client, "alice", "alice-password").status_code == 401
    # The username is free again.
    assert register(client).status_code == 201


def test_delete_account_requires_password(client):
    register(client)
    assert client.request("DELETE", "/api/account", json={"password": "wrong"}).status_code == 403
    assert client.get("/api/me").json() == {"username": "alice"}


def test_deleted_account_signs_out_other_sessions(client):
    with TestClient(app) as other:
        register(client)
        sign_in(other, "alice", "alice-password")
        client.request("DELETE", "/api/account", json={"password": "alice-password"})
        assert other.get("/api/me").status_code == 401
        assert other.get("/api/boards").status_code == 401


# Password hashing


def test_password_hash_is_salted_and_verifies():
    first, second = auth.hash_password("secret"), auth.hash_password("secret")
    assert first != second
    assert "secret" not in first
    assert auth.verify_password("secret", first)
    assert not auth.verify_password("other", first)


def test_verify_rejects_empty_or_unknown_hash():
    assert not auth.verify_password("password", "")
    assert not auth.verify_password("password", "md5$abc")
