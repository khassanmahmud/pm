# Code Review

Date: 2026-10-17. Scope: whole repo at commit `13f47c7` (backend, frontend, Docker, scripts, tests, docs).

## Summary

The codebase is small, readable and consistent with the coding standards in `AGENTS.md`. Board validation lives in one place (`Board` in `backend/app/models.py`) and covers both UI and AI writes. Tests are thorough: 42 backend tests (including live AI), 43 Vitest tests and 33 Playwright tests, all passing.

The main weakness is error handling on the frontend boundary: a failed save is silently ignored, which turns the documented "restart signs users out" behaviour into silent data loss. The AI route also has failure modes the retry does not cover. Everything else is minor.

## Status

All High and Medium findings are fixed (2026-10-17). Low findings are open.

## Findings

Severity: High = data loss or likely user-facing breakage; Medium = real but less likely, or security hardening; Low = polish.

### High

**H1. Failed board saves are silently dropped** - `frontend/src/components/App.tsx:31-39`

`fetch` only rejects on network errors, so a `401` or `422` from `PUT /api/board` resolves normally and `.then(() => undefined, ...)` discards it without even logging. The UI keeps showing the change, but it was never stored.

This is triggered every time the server restarts: `SESSION_SECRET` is random per process (`backend/app/main.py:25`) and is not set in `.env`, so after `./scripts/start.sh` (which always rebuilds and restarts) every open tab's cookie is invalid. The user keeps editing; nothing is saved; a reload shows the login screen and the edits are gone. Chat requests in the same state show only the generic "could not respond" error.

Actions:
- In `updateBoard`, check `response.ok`; on `401` call `setUser(null)` (back to login); on other failures show an error rather than keeping unsaved state silently.
- Treat `401` the same way in `ChatSidebar` (pass an `onUnauthorized` callback, or have `App` own a small `api()` helper that does this for all calls).
- Set `SESSION_SECRET` in `.env` (and mention it in the README `.env` example) so restarts no longer sign users out.
- Add a Vitest case: PUT returns 401 -> login form is shown.

Status: fixed. Saves and chat return to login on 401; other save failures show an error banner; `SESSION_SECRET` added to `.env` and the README. Vitest cases for save 401, save 500 and chat 401.

### Medium

**M1. AI failures outside the board-validation retry return a 500** - `backend/app/ai.py:63-70`, `backend/app/main.py:89-99`

`message.parsed` is `None` when the model returns a refusal or empty content (the SDK only parses when `message.content and not message.refusal`, `openai/lib/_parsing/_completions.py:205`), so `result.board` raises `AttributeError`. The SDK also raises on truncated output (`LengthFinishReasonError`) and on JSON that does not match the schema. None of these are caught, so the user gets a 500 and the generic frontend error, and the retry is never used.

Actions:
- In `ai.chat`, raise `ValueError` when `parsed` is `None`, and catch the SDK's parse errors in the route alongside the existing `ValueError` so they share the single retry.
- Add mocked tests for "parsed is None" and "parse raises".

Status: fixed. `ai.chat` raises `ValueError` when nothing is parsed; the route retries on `ValueError` or `OpenAIError` and returns 502 if both calls fail. Tests added.

**M2. No timeout on OpenRouter calls** - `backend/app/ai.py:48`

The SDK default is a 600 s read timeout with 2 automatic retries (`openai/_constants.py:7-8`), and the route can make two calls, so a stalled provider can hold a request for many minutes while the sidebar shows "Thinking". Normal calls take 10-20 s.

Action: `OpenAI(..., timeout=60)` (or similar).

Status: fixed. `timeout=60, max_retries=0` (the route already retries once), so the worst case is about two minutes.

**M3. Container is reachable from the local network** - `scripts/start.sh:11`, `scripts/start.ps1:10`

`-p 8000:8000` binds to `0.0.0.0` (confirmed in `docker ps`). Anyone on the same network can sign in with the hardcoded `user` / `password` and spend OpenRouter credit through `/api/chat`.

Action: bind to loopback: `-p 127.0.0.1:8000:8000`.

Status: fixed in both start scripts; confirmed `127.0.0.1:8000->8000/tcp` in `docker ps`.

**M4. AI overwrites concurrent board edits** - `backend/app/main.py:87-97`, `frontend/src/components/ChatSidebar.tsx:47-48`

Already listed in `docs/PLAN.md` known limitations. The route reads the board, waits 10-20 s for the model, then saves the AI board over anything the user changed meanwhile (and the frontend replaces local state the same way). Simplest mitigation consistent with the MVP: disable board editing (or show an overlay) while a chat request is in flight. No action required if the limitation is accepted.

Status: fixed for the current tab. The board is `inert` and dimmed while a chat request is in flight (Vitest and Playwright tests). Edits from another tab can still be overwritten; noted in `docs/PLAN.md`.

### Low

**L1. Whitespace-only titles create blank cards** - `frontend/src/components/KanbanColumn.tsx:27`, `KanbanCard.tsx:61`

`required` accepts `"   "`; the value is then trimmed to `""` and saved. The backend accepts empty titles too (`Card.title: str`). Action: ignore submit when the trimmed title is empty (or `pattern="\S.*"` / `minLength` on the inputs). Column titles can also be emptied; same treatment is optional.

**L2. Startup/load errors leave a blank page or crash** - `frontend/src/components/App.tsx:14-25`

If `/api/me` fails at the network level, `user` stays `undefined` and the page stays blank. If `GET /api/board` returns an error, its JSON body (`{detail: ...}`) is stored as the board and rendering throws on `board.columns`. Unlikely in practice; fixed naturally by the helper suggested in H1 (check `ok`, handle 401).

**L3. Unbounded chat input** - `backend/app/main.py:33-35`, `backend/app/ai.py:26-28`

`message` and `history` have no size limit, and history grows for the whole session, so token cost per request grows without bound. Action: cap history to the last N messages (frontend or backend) and add `max_length` on `ChatMessage.content`.

**L4. Failed chat leaves an unanswered user message in history** - `frontend/src/components/ChatSidebar.tsx:29-45`

On error the user message stays in `messages` and is sent as history next time, so the model sees two consecutive user turns. Harmless with this model, but removing it on failure (and putting it back into the input) is simpler for the user to retry.

**L5. `crypto.randomUUID` needs a secure context** - `frontend/src/components/KanbanBoard.tsx:114`

Works on `localhost`, but "Add card" throws if the app is opened via a LAN IP over plain HTTP. Moot if M3 is applied.

**L6. Rename saves on every blur** - `frontend/src/components/KanbanColumn.tsx:46`

`onRenameDone` triggers a PUT even when the title did not change (focus and leave). Cheap, but easy to skip by comparing with the title at focus time. Optional.

**L7. Tracked file that should be ignored** - `frontend/test-results/.last-run.json`

Committed in the initial commit before `/test-results/` was added to `frontend/.gitignore`, so every Playwright run can dirty the tree. Action: `git rm --cached frontend/test-results/.last-run.json`.

**L8. `ai.ask` exists only for one test** - `backend/app/ai.py:51-53`

Used only by `tests/test_ai.py` (Part 8 connectivity check). The live chat tests already cover connectivity. Either keep it as a deliberate smoke test or delete both. Optional.

**L9. Container runs as root** - `Dockerfile`

Acceptable for a local MVP. If hardening later, add a non-root `USER` and make sure the `pm-data` volume is writable by it.

**L10. Duplicate default board fixture** - `frontend/src/test/sampleBoard.ts`

Kept in sync with `backend/app/default_board.json` by a comment only. A test that compares the two (e.g. a Vitest that imports the JSON file) would catch drift. Optional.

## Things that are good

- One validation point for every write; the AI cannot bypass the fixed-column rule.
- `AIBoard` list-of-cards workaround for strict structured outputs is small and tested, including duplicate ids.
- Ordered save queue in `App` and `beforeSend` so the AI reads the latest board.
- Tests use a temp DB per test, a dedicated e2e DB, and mock the AI where it matters; live tests are opt-out via a marker.
- Docker image is a clean two-stage build with `uv sync --locked`, and the repo layout is preserved so paths match local dev.
- Parameterised SQL throughout; session cookie is signed, httponly and `SameSite=Lax`, which also blocks cross-site POST/PUT.

## Action list (recommended order)

| # | Action | Finding | Effort |
|---|---|---|---|
| 1 | Check `response.ok` on saves and chat; on 401 return to login; show save errors; add test | H1, L2 | S |
| 2 | Add `SESSION_SECRET` to `.env` and README example | H1 | XS |
| 3 | Bind container to `127.0.0.1` in both start scripts | M3, L5 | XS |
| 4 | Handle `parsed is None` and SDK parse errors in the chat retry; add tests | M1 | S |
| 5 | Set an OpenRouter client timeout | M2 | XS |
| 6 | Reject blank card titles | L1 | XS |
| 7 | Untrack `frontend/test-results/.last-run.json` | L7 | XS |
| 8 | Cap chat history length and message size | L3 | XS |
| 9 | Drop failed user message from history on chat error | L4 | XS |
| 10 | Decide on M4 (lock board during AI request, or accept) | M4 | S |
| 11 | Optional: L6, L8, L9, L10 | - | XS each |
