<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Frontend

Next.js 16 (App Router), React 19, Tailwind CSS 4, dnd-kit. Built as a static export (`output: "export"` -> `out/`) and served by the FastAPI backend at `/`. `cacheComponents` / PPR must stay off: export mode rejects it. The board is loaded from and saved to the backend (`/api/board`).

## Structure

- `src/app/layout.tsx` - root layout, Geist fonts
- `src/app/page.tsx` - renders `App`
- `src/components/App.tsx` - auth gate and board owner: calls `/api/me`, loads `/api/board` once signed in, holds board state. `updateBoard(next, persist = true)` sets state and queues a `PUT /api/board` (saves are serialized so they arrive in order); renders the board and `ChatSidebar` side by side; handles logout
- `src/components/LoginForm.tsx` - username/password form posting to `/api/login`, shows error on failure
- `src/app/globals.css` - Tailwind setup and color tokens (`primary`, `secondary`, `accent`, `navy`, `muted`)
- `src/lib/board.ts` - `Board` / `Column` / `Card` types and pure helpers: `findColumnId`, `renameColumn`, `addCard`, `updateCard`, `deleteCard`, `moveCard`
- `src/components/KanbanBoard.tsx` - controlled by `board` / `onChange(board, persist?)`. `DndContext` and drag handlers (drag-over updates with `persist=false`; saved on drag end/cancel). Header with card count and Log out button. Collision detection is `pointerWithin` with a `closestCorners` fallback (`closestCorners` alone misses tall empty columns)
- `src/components/KanbanColumn.tsx` - droppable column with inline title input (updates locally while typing, saves on blur or Enter), card list, add-card form
- `src/components/ChatSidebar.tsx` - collapsible AI chat (`w-80`, right side). History kept in component state only and sent with each `POST /api/chat`. Waits for pending board saves (`beforeSend`) before sending so the AI sees the latest board. AI board updates are applied via `updateBoard(board, false)` (the backend already saved them)
- `src/test/sampleBoard.ts` - `initialBoard` test fixture, same as `backend/app/default_board.json`
- `src/components/KanbanCard.tsx` - `KanbanCard` (sortable wrapper, toggles inline editor; drag attributes/listeners are removed while editing), `CardEditor`, and `CardView` (presentation, edit/delete buttons, also used in drag overlay)

## Board data shape

```ts
{ columns: [{ id, title, cardIds: string[] }], cards: { [id]: { id, title, details } } }
```

## Tests

- Unit (Vitest + Testing Library, jsdom): `src/lib/board.test.ts`, `src/components/KanbanBoard.test.tsx`, `src/components/App.test.tsx`, `src/components/ChatSidebar.test.tsx` (mock `fetch`)
- E2E (Playwright, Chromium, 1920x1080): `e2e/auth.spec.ts`, `e2e/chat.spec.ts` (mocks `/api/chat` with `page.route`), `e2e/board.spec.ts` (signs in and resets the board via API in `beforeEach`) - builds the export and serves it with the FastAPI backend (`uv run uvicorn`) on port 8100, using a fresh `backend/data/e2e.db`. Runs with `workers: 1` because all tests share one user's board
