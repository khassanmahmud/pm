# Code Review — Project Management MVP

## Overview

Single-container Kanban app: Next.js 16 static export (React 19, Tailwind CSS 4, dnd-kit) served by a Python 3.13 FastAPI backend (uv), with SQLite storage and OpenRouter (`openai/gpt-oss-120b`) for AI chat. Auth is hardcoded (`user`/`password`) via Starlette signed session cookies.

## Strengths

- Clean separation between backend (`main.py`, `db.py`, `models.py`, `ai.py`) and frontend (components + `lib/board.ts`).
- Pydantic `Board` model enforces fixed column ids/order and card/column consistency on every write (UI + AI). Invalid boards return 422.
- `SessionMiddleware` with httponly signed cookie; all board/chat routes require sign-in (401 otherwise).
- `App.tsx` queues `PUT /api/board` saves via a promise chain so concurrent edits arrive in order.
- Board is `inert`/dimmed while the AI responds; AI updates applied with `updateBoard(board, false)` (no re-save); `beforeSend` waits for pending saves before chat.
- AI retry: malformed board / OpenAI errors retried once; second failure returns 502 without saving.
- Solid test coverage: pytest (health, auth, board, chat, AI), Vitest (board helpers, App, KanbanBoard, ChatSidebar), Playwright e2e (auth, board, chat). Live AI tests gated behind `live` marker + `OPENROUTER_API_KEY`.
- Thorough docs: `PLAN.md`, `DATABASE.md`, per-area `AGENTS.md` files, and `CLAUDE.md`.
- Docker multi-stage build, port bound to `127.0.0.1` only, `pm-data` volume for SQLite persistence.

## Issues & Recommendations

### Security
1. **Hardcoded credentials** (`USERS = {"user": "password"}` in `backend/app/main.py:16`). Documented as MVP limitation, but plaintext in source. Add a TODO for password hashing when real auth arrives.
2. **No CSRF protection** on session-cookie auth. FastAPI/Starlette `SessionMiddleware` doesn't include CSRF. Consider adding a CSRF token or relying on SameSite strict (cookie is already httponly).
3. **Real `OPENROUTER_API_KEY` present in `.env`** — file is gitignored; verify it never gets committed.
4. FastAPI auto-generated OpenAPI docs at `/docs` expose the API surface. Consider disabling in production.

### Reliability / Correctness
5. **KanbanBoard `targetIndex`** (`frontend/src/components/KanbanBoard.tsx:43-46`): `cardIds.indexOf(overId)` returns `-1` if `overId` isn't in the column's list, causing `splice(-1, 0, id)` to insert before the last element. Edge case only; guard with `Math.max(0, ...)` or validate.
6. **Drag-end same-card no-op** (`KanbanBoard.tsx:63`): `active.id === over.id` re-saves the unchanged board. Harmless but wasteful.
7. **No frontend timeout/abort for `/api/chat`** — a stalled call (backend 60s timeout) leaves the UI loading indefinitely. Consider `AbortController`.
8. **`get_board` seed-on-first-access** creates the user row on board read, not login. Documented behavior; a wiped DB won't break a session, but orphaned user rows accumulate for users who never open a board.

### Code Quality
9. **API endpoint strings scattered** across frontend components (`/api/board`, `/api/login`, etc.). Consider a small `api.ts` client for centralization (low priority for MVP).
10. **`findColumnId`** (`frontend/src/lib/board.ts:5-8`) returns `undefined` for unknown ids; callers use `!` non-null assertion. Validation prevents invalid states, but a defensive return could avoid runtime crashes.
11. Tests mix `Board.model_dump()` and `model_dump_json()`; consistent enough since tests pass.

### Testing
12. **`default_board.json` / `sampleBoard.ts` duplication** — must stay in sync (documented in `PLAN.md`). Consider a shared fixture or a test asserting they match.
13. **No test that the Docker image builds/runs** — e2e starts FastAPI directly, not via Docker. A smoke test for `docker build` would catch Dockerfile drift.
14. **Playwright `webServer` reuses existing server locally** (`reuseExistingServer: !process.env.CI`) — a stale server on port 8100 could cause flaky local runs.

### DevOps
15. **Dockerfile uses `UV_NO_DEV=1` + `--no-install-project`** — pytest isn't available in the production image, so `uv run pytest` only works locally. Fine for production, but means the container can't self-test.
16. **Windows scripts (`start.ps1`, `stop.ps1`) untested** — noted as a known limitation in `PLAN.md`.

## Verdict

The codebase is clean, well-tested, and follows the documented architecture. No critical bugs found. The main items to address before/after MVP release are CSRF protection, credential handling, and minor edge cases in drag/drop indexing.
