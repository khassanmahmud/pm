from conftest import sign_in


def test_me_requires_sign_in(client):
    assert client.get("/api/me").status_code == 401


def test_login_success_sets_session(client):
    response = sign_in(client)
    assert response.status_code == 200
    assert response.json() == {"username": "user"}
    assert "session" in response.cookies
    assert client.get("/api/me").json() == {"username": "user"}


def test_session_cookie_is_httponly(client):
    response = sign_in(client)
    assert "httponly" in response.headers["set-cookie"].lower()


def test_login_wrong_password(client):
    response = sign_in(client, password="wrong")
    assert response.status_code == 401
    assert client.get("/api/me").status_code == 401


def test_login_unknown_user(client):
    assert sign_in(client, username="admin").status_code == 401


def test_login_missing_fields(client):
    assert client.post("/api/login", json={"username": "user"}).status_code == 422


def test_logout_clears_session(client):
    sign_in(client)
    assert client.post("/api/logout").status_code == 200
    assert client.get("/api/me").status_code == 401


def test_tampered_cookie_rejected(client):
    client.cookies.set("session", "forged-value")
    assert client.get("/api/me").status_code == 401
