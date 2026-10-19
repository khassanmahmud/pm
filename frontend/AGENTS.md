<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Frontend

Next.js 16 (App Router), React 19, Tailwind CSS 4, dnd-kit. Built as a static export (`output: "export"` -> `out/`) and served by the FastAPI backend at `/`. `cacheComponents` / PPR must stay off: export mode rejects it. Boards are loaded from and saved to the backend (`/api/boards/...`).

## Structure

- `src/app/layout.tsx` - root layout, Geist fonts
- `src/app/page.tsx` - renders `App`
- `src/lib/api.ts` - `api(url, method, body?)`: fetch with a JSON body
- `src/lib/board.ts` - `Board` / `Column` / `Card` (`priority`, `dueDate`, `labels`) / `BoardSummary` types and pure helpers: `newCard`, `findColumnId`, `renameColumn`, `addCard`, `updateCard(board, id, fields)`, `deleteCard`, `moveCard`, `parseLabels`, `matchesFilter`, `today`, `overdueCardIds` (due before today, not in Done), `formatDueDate`
- `src/components/App.tsx` - auth gate and state owner: calls `/api/me`, then `/api/boards`; selects the last used board (`localStorage` key `pm.lastBoardId`) or the first; loads the selected board after pending saves finish (state keyed by board id, so a stale board is never shown or saved under another id). `updateBoard(next, persist = true)` sets state, updates the card count in the board list and queues a `PUT /api/boards/{id}` (saves are serialized so they arrive in order; a `401` signs out to the login form, other failures show an error banner). Creates, renames and deletes boards; shows the account view or an empty state when there are no boards; locks the board and the board list while the AI is responding
- `src/components/BoardNav.tsx` - left sidebar (`w-56`): board list with card counts (`aria-current` on the open one), new board form (optional sample cards), username, Account and Log out buttons
- `src/components/LoginForm.tsx` - sign in form, toggles to a create account form (`/api/register`); shows errors for bad credentials, taken (409) or invalid (422) usernames
- `src/components/AccountSettings.tsx` - change password and delete account (password confirmed by the backend)
- `src/app/globals.css` - Tailwind setup and color tokens (`primary`, `secondary`, `accent`, `navy`, `muted`)
- `src/components/KanbanBoard.tsx` - controlled by `board` / `onChange(board, persist?)`; `locked` makes it `inert` and dimmed. Header with board name, Rename (inline form) and Delete board (inline confirmation), stats (card count, % done, overdue count). Search box and priority filter (local state only; filtered columns pass only matching cards to `SortableContext`). `DndContext` and drag handlers (drag-over updates with `persist=false`; saved on drag end/cancel). Collision detection is `pointerWithin` with a `closestCorners` fallback (`closestCorners` alone misses tall empty columns)
- `src/components/KanbanColumn.tsx` - droppable column with inline title input (updates locally while typing, saves on blur or Enter), card list, count (`shown/total` while filtering), add-card form
- `src/components/ChatSidebar.tsx` - collapsible AI chat (`w-80`, right side) for one board (`boardId`; `App` remounts it per board so each board starts a fresh conversation). History kept in component state only and sent with each `POST /api/boards/{id}/chat`. Waits for pending board saves (`beforeSend`) before sending so the AI sees the latest board. AI board updates are applied via `updateBoard(board, false)` (the backend already saved them). Reports in-flight requests via `onBusyChange` and a `401` via `onUnauthorized`
- `src/test/sampleBoard.ts` - `initialBoard` test fixture, imported from `backend/app/default_board.json`
- `src/components/KanbanCard.tsx` - `KanbanCard` (sortable wrapper, toggles inline editor; drag attributes/listeners are removed while editing), `CardEditor` (title, details, priority, due date, comma-separated labels), and `CardView` (presentation with priority, due/overdue and label badges, edit/delete buttons, also used in drag overlay)

## Board data shape

```ts
{
  columns: [{ id, title, cardIds: string[] }],
  cards: { [id]: { id, title, details, priority: "low" | "medium" | "high" | null, dueDate: "YYYY-MM-DD" | null, labels: string[] } }
}
```

## Tests

- Unit (Vitest + Testing Library, jsdom): `src/lib/board.test.ts`, `src/components/*.test.tsx`. `App.test.tsx` runs against an in-memory fake of the API (`fakeApi`, with per-route overrides keyed by `"METHOD /url"`); other component tests mock `fetch` directly. `npm run test:coverage` reports coverage (drag handlers are covered by Playwright instead)
- E2E (Playwright, Chromium, 1920x1080): `e2e/auth.spec.ts`, `e2e/account.spec.ts`, `e2e/boards.spec.ts`, `e2e/board.spec.ts`, `e2e/chat.spec.ts` (mocks `/api/boards/*/chat` with `page.route`). `e2e/helpers.ts` has `newUser` (registers a unique user, which gets a fresh sample board, and opens the app), `signIn`, `saved`, `boardList` and `alert` (Next.js renders an empty `role="alert"` route announcer, so filter by text). Builds the export and serves it with the FastAPI backend (`uv run uvicorn`) on port 8100, using a fresh `backend/data/e2e.db`. Runs with `workers: 1`
