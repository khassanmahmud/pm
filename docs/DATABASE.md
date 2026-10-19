# Database

SQLite, accessed with Python's built-in `sqlite3` module (no ORM). The database file is created on startup if it does not exist.

## Location

- Path from the `DB_PATH` env var, default `backend/data/pm.db`
- In Docker, `/app/backend/data` is mounted as a named volume (`pm-data`) so data survives container restarts
- `backend/data/` is gitignored

## Schema (version 1)

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,     -- "scrypt$<salt hex>$<hash hex>"; '' means no password (cannot sign in)
  created_at TEXT NOT NULL         -- ISO 8601 UTC
);

CREATE TABLE boards (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  data TEXT NOT NULL,              -- board JSON, see below
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX boards_user_id ON boards(user_id);
```

- A user has any number of boards. Every query filters by `user_id`, so a user can never read or write another user's board (the API answers 404).
- Usernames are unique case-insensitively. Passwords are hashed with `hashlib.scrypt` (n=2^14, r=8, p=1, 16-byte salt).
- Foreign keys are enabled per connection, so deleting a user deletes their boards.
- The whole board is stored as one JSON document. The frontend and the AI both read and write the full board, so there is no need to split cards and columns into tables. The board list's card count comes from `json_each(data, '$.cards')`.

## Versioning and migration

`PRAGMA user_version` holds the schema version. On startup `init_db`:

- New database: creates the schema, sets version 1
- Version 0 with tables (the MVP schema: `users(id, username)`, `boards(id, user_id UNIQUE, data, updated_at)`): rebuilds both tables in one transaction. Users keep their ids with an empty password hash; boards keep their data and are named "Product Launch"
- Then ensures the demo user `user` / `password` exists (created with the default board, or given its password if migrated)

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
    "c1": { "id": "c1", "title": "Competitor research", "details": "Summarize pricing...",
            "priority": "medium", "dueDate": null, "labels": ["research"] },
    "c2": { "id": "c2", "title": "Customer interviews", "details": "Schedule eight...",
            "priority": "high", "dueDate": "2026-11-06", "labels": ["research", "customers"] }
  }
}
```

- `columns` is ordered; `cardIds` order is the card order within the column
- `cards` is keyed by card id
- `priority` (`low` | `medium` | `high` | null), `dueDate` (`YYYY-MM-DD` | null) and `labels` (list of strings) are optional on input and default to null / null / `[]`, so boards saved by the MVP load unchanged

## Validation

Every write (from the UI or the AI) is validated with Pydantic before saving. A board is rejected (422) unless:

- Columns are exactly the five fixed ids in order: `backlog`, `todo`, `progress`, `review`, `done` (titles may change)
- Every card in `cards` appears in exactly one column, and every id in `cardIds` exists in `cards`
- Each card's `id` matches its key
- `priority` is one of the allowed values and `dueDate` is a real ISO date

## Lifecycle

- Registering creates the user and a default board ("Product Launch", from `backend/app/default_board.json`)
- New boards start empty, or as a copy of the default board when `sample` is set
- `PUT /api/boards/{id}` replaces the whole board and sets `updated_at`; renaming also sets `updated_at`
- Deleting the last board is allowed; the UI then shows an empty state
- Last write wins; no concurrency control
