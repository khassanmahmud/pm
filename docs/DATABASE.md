# Database

SQLite, accessed with Python's built-in `sqlite3` module (no ORM). The database file is created on startup if it does not exist.

## Location

- Path from the `DB_PATH` env var, default `backend/data/pm.db`
- In Docker, `/app/backend/data` is mounted as a named volume (`pm-data`) so data survives container restarts
- `backend/data/` is gitignored

## Schema

```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS boards (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
  data TEXT NOT NULL,          -- board JSON, see below
  updated_at TEXT NOT NULL     -- ISO 8601 UTC
);
```

- One board per user for the MVP, enforced by `UNIQUE (user_id)`. Dropping that constraint later allows multiple boards per user.
- No password column: credentials stay hardcoded for the MVP. A `password_hash` column can be added when real auth arrives.
- The whole board is stored as one JSON document. The frontend and the AI both read and write the full board, so there is no need to split cards and columns into tables.

## Board JSON

Same shape as the `Board` type in `frontend/src/lib/board.ts`:

```json
{
  "columns": [
    { "id": "backlog", "title": "Backlog", "cardIds": ["c1", "c2"] },
    { "id": "todo", "title": "To Do", "cardIds": [] },
    { "id": "progress", "title": "In Progress", "cardIds": [] },
    { "id": "review", "title": "Review", "cardIds": [] },
    { "id": "done", "title": "Done", "cardIds": [] }
  ],
  "cards": {
    "c1": { "id": "c1", "title": "Competitor research", "details": "Summarize pricing..." },
    "c2": { "id": "c2", "title": "Customer interviews", "details": "Schedule eight..." }
  }
}
```

- `columns` is ordered; `cardIds` order is the card order within the column
- `cards` is keyed by card id

## Validation

Every write (from the UI or the AI) is validated with Pydantic before saving. A board is rejected (422) unless:

- Columns are exactly the five fixed ids in order: `backlog`, `todo`, `progress`, `review`, `done` (titles may change)
- Every card in `cards` appears in exactly one column, and every id in `cardIds` exists in `cards`
- Each card's `id` matches its key

## Lifecycle

- The user row is created on first board access if missing
- `GET /api/board` returns the user's board; if none exists, the default board (the current demo data) is saved and returned
- `PUT /api/board` replaces the whole board and sets `updated_at`
- Last write wins; no concurrency control for the MVP
