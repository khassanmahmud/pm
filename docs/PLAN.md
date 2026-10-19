# Project Plan

Agents check off substeps as they complete them. After each part, stop for user review. The user commits.

## Key decisions

- Single Docker container. FastAPI on port 8000 serves the API at `/api/*` and the static Next.js export at `/`.
- Python 3.13, managed with uv. Backend tests with pytest. Frontend tests with Vitest (unit) and Playwright (e2e).
- Auth: backend login endpoint with hardcoded credentials (`user` / `password`), signed session cookie.
- Database: SQLite. Each user's board is stored as a single JSON document (same shape as `Board` in `frontend/src/lib/board.ts`).
- AI: OpenRouter, model `openai/gpt-oss-120b`. Structured output returns a reply and optionally the full updated board.
- Chat history lives in the browser only (not persisted).

## Design decisions made during implementation

Infrastructure
- Docker keeps the repo layout (`/app/backend`, `/app/frontend/out`), so the backend serves `../frontend/out` both locally and in the container.
- SQLite file lives in the Docker volume `pm-data` (mounted at `/app/backend/data`); `DB_PATH` overrides the location.
- Next.js `cacheComponents` and `partialPrefetching` removed: static export throws "PPR cannot be enabled in export mode" with `cacheComponents` on (`next/dist/export/index.js`).

Auth
- Starlette `SessionMiddleware` with a signed httponly cookie. Secret from `SESSION_SECRET` (set in `.env`), otherwise random per process (restart signs users out).
- Any `401` from a board save or chat request returns the user to the login form. Other save failures show an error banner.
- The container port is bound to `127.0.0.1` so the hardcoded credentials are not reachable from the network.

Data
- Columns are fixed: the five ids `backlog`, `todo`, `progress`, `review`, `done` must be present in order; only titles can change. Enforced on every write, from the UI or the AI.
- The user row is created on first board access (not at login), so a wiped database never breaks a signed-in session.
- Default board lives in `backend/app/default_board.json`; the frontend copy (`src/test/sampleBoard.ts`) is a test fixture only.

Frontend
- Card editing uses an edit button that opens an inline editor (avoids conflicting with drag). Drag attributes are removed from the card while editing; otherwise dnd-kit marks the editor's inputs as disabled.
- `App` owns the board state. Saves are queued so they reach the server in order. Drag-over changes are local only; the board is saved on drag end or cancel.
- Drop target detection uses `pointerWithin` with a `closestCorners` fallback. `closestCorners` alone picked nearby cards over tall empty columns.
- Chat sidebar (320px, collapsible) waits for pending saves before sending, so the AI sees the latest board. AI board updates are applied locally without re-saving (the backend already saved them).
- The board is locked (`inert`, dimmed) while a chat request is in flight, so the AI's board cannot overwrite edits made meanwhile.

AI
- The AI-facing board uses a card list instead of a dict, because strict structured outputs do not support dict-keyed objects. `AIBoard.to_board()` converts it, rejects duplicate card ids, and validates.
- Requests set OpenRouter `provider.require_parameters` so only providers that support structured outputs are used.
- The model occasionally returns malformed boards (seen in about 4 of 18 calls in one batch, 0 of 72 in another). The chat route retries once; if the board is still invalid, nothing is saved and the reply says so. Refusals, empty or truncated output and OpenRouter errors use the same retry; if both attempts fail the route returns 502.
- The OpenRouter client uses a 60s timeout and no SDK retries (the route's retry is enough), so a stalled call fails within about two minutes.

Testing
- Playwright runs FastAPI (not Docker) on port 8100 with a fresh `backend/data/e2e.db`, a 1920x1080 viewport, and `workers: 1` because all tests share one user's board.
- Live AI tests use the `live` pytest marker; they skip without `OPENROUTER_API_KEY` and can be deselected with `-m 'not live'`.

Accounts and boards (Part 11)
- Passwords are hashed with stdlib `hashlib.scrypt` (no new dependency). The session stores `user_id` and every request looks the user up, so deleting an account signs out all of its sessions.
- Session cookie is `SameSite=Strict`, which blocks cross-site form posts (code review CSRF item) without a token.
- The demo user `user` / `password` is ensured on every startup, so the Docker instructions and existing sessions keep working.
- Schema versioned with `PRAGMA user_version`. The MVP schema (version 0) is migrated in one transaction: users keep their ids (without a password, so only the demo user can sign in), boards are named "Product Launch".
- Board routes are `/api/boards/{id}`; boards of other users answer 404, not 403, so ids are not revealed.
- New users get the sample board. New boards start empty or, on request, with the sample cards. Deleting the last board is allowed (empty state).
- Card fields `priority`, `dueDate`, `labels` default to null / null / `[]`, so MVP boards load unchanged. `dueDate` is a string validated as an ISO date, so the AI's strict JSON schema has no `format` keyword; `labels` uses `default_factory` so the schema has no `default`.
- The AI prompt includes today's date so relative due dates ("next Friday") work.
- Search and the priority filter are view-only (not saved). Filtered columns pass only matching cards to dnd-kit; drop positions are computed against the full column.
- The selected board is remembered in `localStorage`. The chat sidebar is remounted per board, so each board has its own conversation. The board list is locked with the board while the AI responds, so a reply cannot land on another board.
- The frontend test fixture imports `backend/app/default_board.json` directly (the Dockerfile copies it into the Node stage because `next build` type-checks tests).
- E2E tests register a unique user each, instead of resetting one shared board.

## Known limitations

- AI edits take 10-20s (longer if retried) because the model returns the whole board.
- Board edits from another tab while the AI is responding are overwritten by the AI's board (last write wins). The current tab is locked during the request.
- Below about 1850px wide (with both sidebars open) the board scrolls horizontally.
- Boards cannot be shared between users; columns are still fixed.
- No password reset (there is no email); an admin would have to delete the account in SQLite.
- Windows scripts (`start.ps1`, `stop.ps1`) have not been run on Windows.

## Part 1: Plan

- [x] Enrich this document with substeps, tests and success criteria
- [x] Describe the existing frontend code in `frontend/AGENTS.md`
- [x] User approves the plan

Success: user signs off on this document.

## Part 2: Scaffolding

- [x] Create uv project in `backend/` (`pyproject.toml`, `uv.lock`) with FastAPI and uvicorn
- [x] `backend/app/main.py`: `GET /api/health` returns `{"status": "ok"}`; serve a hello-world `static/index.html` at `/` that calls `/api/health` and displays the result (replaced by the Next.js export in Part 3)
- [x] `Dockerfile` in project root (Python + uv), `.dockerignore`
- [x] Scripts in `scripts/`: `start.sh` / `stop.sh` (Mac, Linux), `start.ps1` / `stop.ps1` (Windows). Start builds the image and runs the container on port 8000 with `.env` passed in; stop removes the container
- [x] pytest test for `/api/health`
- [x] Update `backend/AGENTS.md` and `scripts/AGENTS.md`

Tests: `uv run pytest` passes. Manual: run start script, open http://localhost:8000, page shows the API response; stop script stops the container.

## Part 3: Add in Frontend

- [x] Configure Next.js for static export (`output: "export"`); removed `cacheComponents` and `partialPrefetching` (incompatible with export)
- [x] Multi-stage Dockerfile: Node stage builds the frontend, Python stage copies `out/` and serves it at `/`
- [x] Add card editing: edit button on each card opens an inline title/details editor (business requirement not yet implemented)
- [x] Unit tests for card editing (`board.ts` helper and component)
- [x] Point Playwright at the FastAPI-served app (uvicorn on port 8100); e2e tests for existing behavior plus editing

Tests: `npm test` and `npm run test:e2e` pass; `uv run pytest` passes. Success: the Kanban board displays at http://localhost:8000 from the container.

## Part 4: Fake user sign in

- [x] Backend: `POST /api/login` (validates `user`/`password`, sets signed session cookie), `POST /api/logout`, `GET /api/me` (401 if not signed in)
- [x] Frontend: on load call `/api/me`; show login form if not signed in, board if signed in; logout button in header
- [x] Error message on invalid credentials

Tests: pytest for login success, failure, logout, `/api/me` with and without cookie. Vitest for login form. Playwright: must log in to see board, bad credentials rejected, logout returns to login, session persists across reload.

## Part 5: Database modeling

- [x] Write `docs/DATABASE.md`: tables `users (id, username)` and `boards (id, user_id unique, data JSON, updated_at)`; board JSON shape with example; validation rules (fixed column ids); creation on startup; default board seeded for a user on first access
- [x] User signs off on the schema

Success: user approval.

## Part 6: Backend API

- [x] `backend/app/db.py`: create SQLite db and tables if missing, in the app lifespan (`DB_PATH`, default `backend/data/pm.db`)
- [x] Pydantic models for `Board`, `Column`, `Card` in `backend/app/models.py`, validating fixed column ids and card consistency
- [x] `GET /api/board`: returns the signed-in user's board, seeding the default if none
- [x] `PUT /api/board`: validates and replaces the signed-in user's board
- [x] Both routes require a session (401 otherwise)

Tests (pytest, temp db per test): db created when missing; default board seeded; PUT then GET round-trips; invalid board rejected (422); unauthenticated requests rejected; boards are isolated per user.

## Part 7: Frontend + Backend

- [x] Frontend loads board from `GET /api/board` after login
- [x] Every change (move, add, edit, delete) saves via `PUT /api/board`; saves are queued so they arrive in order; drags save on drop
- [x] Column rename updates locally while typing, saves on blur or Enter
- [x] Mount a Docker volume (`pm-data`) for the SQLite file so data survives container restarts
- [x] Playwright uses its own database, resets the board before each test, and runs with one worker

Tests: Vitest with mocked fetch (load, save on each action, rename saves on blur only). Playwright: each change persists after reload; data persists after container restart (manual check).

## Part 8: AI connectivity

- [x] `backend/app/ai.py`: OpenRouter client via the `openai` SDK (base URL `https://openrouter.ai/api/v1`), key from `OPENROUTER_API_KEY`, model `openai/gpt-oss-120b`
- [x] Live test that asks "What is 2+2?" (no debug route; container check via `docker exec`)

Tests: live pytest (skipped if no key) asserting the answer contains "4". Success: real call succeeds from inside the container.

## Part 9: AI with board context

- [x] `POST /api/chat`: body `{message, history}`; backend sends system prompt + current board JSON + history + message
- [x] Structured output schema: `{reply: string, board: AIBoard | null}`, where `AIBoard` lists cards as an array (strict mode does not support dicts) and is converted to `Board`
- [x] If `board` is returned, validate and save it; response returns `{reply, board}`
- [x] Retry the AI call once if it returns an invalid board (model occasionally emits malformed boards)

Tests: pytest with mocked AI: reply only (board unchanged), reply with board update (saved), invalid board retried then saved, invalid twice rejected without saving, duplicate card ids rejected, history passed through, messages built correctly. Live tests (marker `live`, skipped without key): question without change, add a card, history used.

## Part 10: AI chat sidebar

- [x] Sidebar component: message list, input (Enter sends, Shift+Enter newline), submit button (purple secondary), loading state, error message, collapsible
- [x] History kept in React state, sent with each request
- [x] If response includes a board, update the board in the UI immediately (no re-save)
- [x] Wait for pending board saves before sending a chat message
- [x] Fix drop into tall empty columns (`pointerWithin` collision detection); Playwright viewport 1920x1080
- [x] Styled with the project color scheme

Tests: Vitest with mocked fetch (sends history, renders replies, applies board update). Playwright with mocked `/api/chat` route verifying the board refreshes. Manual check with the live AI.

## Part 11: User management, multiple boards, richer cards

- [x] Schema version 1: `users.password_hash`, `created_at`; `boards.name`, `created_at`, many boards per user, cascade delete; migration from the MVP schema
- [x] `POST /api/register`, login against the database, `POST /api/account/password`, `DELETE /api/account`
- [x] Board routes: list, create (empty or sample), rename, delete, get, put, chat, all scoped to the signed-in user
- [x] Card `priority`, `dueDate`, `labels`, validated on every write; AI prompt describes them
- [x] Frontend: create account form, board sidebar (switch, create), board rename / delete, account settings
- [x] Card editor fields and badges, overdue flag, search and priority filter, progress and overdue stats
- [x] Docs updated (`AGENTS.md` files, `DATABASE.md`, `README.md`, `CLAUDE.md`)

Tests: pytest (registration, validation, password change, account deletion and session invalidation, hashing, board CRUD, ownership 404s, card field validation, migration, chat per board) with `pytest-cov` (99% of `app`, the rest needs a live key). Vitest (helpers, components, `App` against an in-memory API fake) with `npm run test:coverage`. Playwright: `auth`, `account`, `boards`, `board`, `chat` specs, each test with its own user.

