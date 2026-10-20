# Backend

FastAPI app, Python 3.13, managed with uv.

## Structure

- `app/main.py` - FastAPI app. API routes under `/api`; the Next.js export in `../frontend/out` is mounted at `/` (must stay last). Run `npm run build` in `frontend/` to serve the UI locally
- `app/models.py` - Pydantic `Board` / `Column` / `Card` (optional `priority`, `dueDate`, `labels`), `BoardSummary`, `EMPTY_BOARD`, `DEFAULT_BOARD` (parsed from `default_board.json`); `Board` validates fixed column ids and card consistency
- `app/auth.py` - `hash_password` / `verify_password` (stdlib scrypt)
- `app/db.py` - SQLite via `sqlite3`: `init_db` (run in app lifespan; creates or migrates the schema via `PRAGMA user_version`, ensures the demo user), user functions (`create_user`, `authenticate`, `check_password`, `set_password`, `delete_user`) and board functions scoped by user id (`list_boards`, `create_board`, `get_board`, `save_board`, `rename_board`, `delete_board`). Path from `DB_PATH`, default `data/pm.db`
- `app/default_board.json` - board seeded for new users (also the frontend test fixture)
- `app/ai.py` - OpenRouter via the `openai` SDK, model `openai/gpt-oss-120b`; key from `OPENROUTER_API_KEY` (client created per call, 60s timeout, no SDK retries). `chat(board, history, message)` sends a system prompt containing the board JSON and returns a structured `AIResponse {reply, board | null}`, raising `ValueError` if nothing was parsed (refusal or empty content). The AI-facing board uses a card list (`AIBoard`) because strict structured outputs do not support dict-keyed objects; `AIBoard.to_board()` converts and validates. Requests set `provider.require_parameters` so OpenRouter only routes to providers that support structured outputs
- `tests/` - pytest; `conftest.py` points `DB_PATH` at a temp file per test, lowers the scrypt cost, provides `client` (runs lifespan), `signed_in` and `board_id` fixtures and `sign_in` / `register` helpers, loads the root `.env`, and defines the `live` marker (skips real AI calls when no key). In a fresh test database the demo user's board has id 1

See `docs/DATABASE.md` for the schema.

## Auth

Starlette `SessionMiddleware` (signed, httponly, `SameSite=Strict` cookie `session`, which also blocks cross-site form posts). Secret from `SESSION_SECRET` env var, otherwise random per process (sessions reset on restart). The session holds `user_id`. Use the `CurrentUser` dependency to require sign in: it looks the user up on every request, so a deleted account is signed out everywhere (401). Usernames: 3-32 of `A-Za-z0-9_.-`, unique ignoring case. Passwords: 8-128 characters. The demo user `user` / `password` is always created on startup.

## Routes

- `GET /api/health` - `{"status": "ok"}`
- `POST /api/register` - body `{username, password}`; creates the user with the default board, signs in, returns `{username}` (201); 409 if taken, 422 if invalid
- `POST /api/login` - body `{username, password}`; sets session, returns `{username}` (stored spelling); 401 on bad credentials
- `POST /api/logout` - clears session
- `GET /api/me` - `{username}` or 401
- `POST /api/account/password` - body `{currentPassword, newPassword}`; 403 if the current password is wrong
- `DELETE /api/account` - body `{password}`; deletes the user and their boards, clears the session (204); 403 if the password is wrong

Board routes require sign in (401) and answer 404 for unknown boards and other users' boards:

- `GET /api/boards` - `[{id, name, cardCount, updatedAt}]` in creation order
- `POST /api/boards` - body `{name, sample?}` (name 1-80 chars, trimmed); creates an empty board, or a copy of the default board if `sample`; returns the summary (201)
- `PATCH /api/boards/{id}` - body `{name}`; returns the summary
- `DELETE /api/boards/{id}` - 204
- `GET /api/boards/{id}` - the board JSON
- `PUT /api/boards/{id}` - body is the full board; validated (422 if invalid), saved, returned
- `POST /api/boards/{id}/chat` - body `{message, history: [{role: user|assistant, content}]}`; returns `{reply, board | null}`. A valid AI board is saved to that board. If the AI returns an invalid board or the call fails (`ValueError`, `OpenAIError`), it is retried once; if the board is still invalid, nothing is saved and the reply notes it was not applied; if both calls failed, 502

## Commands

```bash
uv sync
uv run pytest            # includes live AI tests when OPENROUTER_API_KEY is set
uv run pytest -m 'not live'  # skip them
uv run pytest -m 'not live' --cov=app --cov-report=term-missing   # coverage
uv run uvicorn app.main:app --reload   # http://localhost:8000
```
