# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Project requirements, coding standards and color scheme are in `AGENTS.md` (root). Each area has its own detailed `AGENTS.md`: `backend/AGENTS.md` (routes, auth, AI), `frontend/AGENTS.md` (components, Next.js 16 caveats), `scripts/AGENTS.md`. Read the relevant one before working in that area. `docs/PLAN.md` holds the step plan, design decisions and known limitations; `docs/DATABASE.md` the schema. Follow the plan's convention: check off substeps, stop for user review after each part, and let the user commit.

## Commands

```bash
# Full app in Docker (http://localhost:8000, register or sign in user / password)
./scripts/start.sh   # rebuilds image, replaces container pm-app; needs .env with OPENROUTER_API_KEY
./scripts/stop.sh

# Backend (run in backend/)
uv sync
uv run pytest -m 'not live'                      # skip real OpenRouter calls (add --cov=app for coverage)
uv run pytest tests/test_board.py::test_name     # single test
uv run uvicorn app.main:app --reload             # serves ../frontend/out at /, so build the frontend first

# Frontend (run in frontend/)
npm test                                  # Vitest unit tests (npm run test:coverage for coverage)
npx vitest run src/lib/board.test.ts -t "name"   # single test
npm run test:e2e                          # Playwright; builds export, starts FastAPI on :8100 with fresh backend/data/e2e.db
npx playwright test e2e/board.spec.ts     # single e2e file
npm run lint
npm run build                             # static export to out/
```

## Architecture

- One process: FastAPI serves `/api/*` and mounts the Next.js static export (`frontend/out`) at `/` (mount must stay last in `backend/app/main.py`). The Docker image keeps the repo layout (`/app/backend`, `/app/frontend/out`) so the same relative path works locally and in the container. No `next dev` server is used in production or e2e.
- Next.js runs as `output: "export"`; `cacheComponents`/PPR must stay off (export mode rejects it).
- Auth is a Starlette signed session cookie (`SameSite=Strict`) holding `user_id`. Users register via `/api/register`; passwords are scrypt-hashed in `users.password_hash` (`backend/app/auth.py`). The demo user `user` / `password` is created on every startup. `SESSION_SECRET` is random per process unless set, so restarts sign users out.
- Each user has many boards; each board is one JSON document in SQLite (`boards.data`), same shape as `Board` in `frontend/src/lib/board.ts`. All board queries are scoped by user id (other users' boards are 404). Pydantic `Board` in `backend/app/models.py` enforces the five fixed column ids (`backlog`, `todo`, `progress`, `review`, `done`, in order) on every write, whether from the UI or the AI. The schema is versioned with `PRAGMA user_version`; `init_db` migrates MVP databases. `DB_PATH` overrides the db location (tests use a temp file per test).
- Default board is `backend/app/default_board.json` (seeded for new users); `frontend/src/test/sampleBoard.ts` imports it as the test fixture.
- Frontend: `App.tsx` owns the board list and the selected board's state, and serializes `PUT /api/boards/{id}` saves so they arrive in order. Drag-over updates are local (`persist=false`); save happens on drag end/cancel.
- AI chat: `POST /api/boards/{id}/chat` sends the board JSON plus browser-held history to OpenRouter (`openai/gpt-oss-120b`) with strict structured output `{reply, board | null}`. The AI-facing board uses a card list (`AIBoard`) because strict mode disallows dicts; `AIBoard.to_board()` converts and validates. An invalid board is retried once, then rejected without saving. The backend saves AI boards, so the frontend applies them with `updateBoard(board, false)` (no re-save) and waits for pending saves before sending a chat message.
- Live AI tests are marked `live` and skip without `OPENROUTER_API_KEY` (loaded from root `.env` by `conftest.py`). Playwright mocks `/api/boards/*/chat`; each test registers its own user (`e2e/helpers.ts` `newUser`) so tests do not share boards.
