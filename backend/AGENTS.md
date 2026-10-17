# Backend

FastAPI app, Python 3.13, managed with uv.

## Structure

- `app/main.py` - FastAPI app. API routes under `/api`; the Next.js export in `../frontend/out` is mounted at `/` (must stay last). Run `npm run build` in `frontend/` to serve the UI locally
- `app/models.py` - Pydantic `Board` / `Column` / `Card`; `Board` validates fixed column ids and card consistency
- `app/db.py` - SQLite via `sqlite3`: `init_db` (run in app lifespan), `get_board` (seeds default), `save_board`. Path from `DB_PATH`, default `data/pm.db`
- `app/default_board.json` - board seeded for new users
- `app/ai.py` - OpenRouter via the `openai` SDK, model `openai/gpt-oss-120b`; key from `OPENROUTER_API_KEY` (client created per call). `chat(board, history, message)` sends a system prompt containing the board JSON and returns a structured `AIResponse {reply, board | null}`. The AI-facing board uses a card list (`AIBoard`) because strict structured outputs do not support dict-keyed objects; `AIBoard.to_board()` converts and validates. Requests set `provider.require_parameters` so OpenRouter only routes to providers that support structured outputs
- `tests/` - pytest; `conftest.py` points `DB_PATH` at a temp file per test, provides a `client` fixture (runs lifespan), loads the root `.env`, and defines the `live` marker (skips real AI calls when no key)

See `docs/DATABASE.md` for the schema.

## Auth

Starlette `SessionMiddleware` (signed, httponly cookie `session`). Secret from `SESSION_SECRET` env var, otherwise random per process (sessions reset on restart). Credentials are hardcoded in `USERS`. Use the `current_user` dependency to require sign in (401 otherwise).

## Routes

- `GET /api/health` - `{"status": "ok"}`
- `POST /api/login` - body `{username, password}`; sets session, returns `{username}`; 401 on bad credentials
- `POST /api/logout` - clears session
- `GET /api/me` - `{username}` or 401
- `GET /api/board` - signed-in user's board (seeds default on first access); 401 if not signed in
- `PUT /api/board` - body is the full board; validated (422 if invalid), saved, returned
- `POST /api/chat` - body `{message, history: [{role: user|assistant, content}]}`; returns `{reply, board | null}`. A valid AI board is saved. If the AI returns an invalid board, the call is retried once; if still invalid, nothing is saved and the reply notes it was not applied

## Commands

```bash
uv sync
uv run pytest            # includes live AI tests when OPENROUTER_API_KEY is set
uv run pytest -m 'not live'  # skip them
uv run uvicorn app.main:app --reload   # http://localhost:8000
```
