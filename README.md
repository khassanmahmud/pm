# Project Management MVP

A Kanban board with an AI assistant. Sign in, manage cards across five columns with drag and drop, and ask the AI chat sidebar to create, edit or move cards for you.

## Features

- Sign in (MVP credentials: `user` / `password`)
- One Kanban board per user with five fixed, renameable columns
- Add, edit, delete and drag-and-drop cards
- AI chat sidebar that answers questions about the board and updates it
- Board saved in SQLite, kept across restarts

## Stack

- Frontend: Next.js (static export), React, Tailwind CSS, dnd-kit
- Backend: Python FastAPI (managed with uv), serves the API at `/api` and the frontend at `/`
- Database: SQLite
- AI: OpenRouter, model `openai/gpt-oss-120b`
- Packaged as a single Docker container

## Run

Requires Docker. Create a `.env` file in the project root:

```
OPENROUTER_API_KEY=your-key
SESSION_SECRET=any-long-random-string
```

`SESSION_SECRET` keeps you signed in across restarts.

Then start the app:

```bash
./scripts/start.sh      # Mac / Linux
.\scripts\start.ps1     # Windows
```

Open http://localhost:8000 (bound to localhost only) and sign in with `user` / `password`. Stop with `./scripts/stop.sh` or `.\scripts\stop.ps1`.

Data lives in the Docker volume `pm-data`; `docker volume rm pm-data` resets it.

## Development

```bash
# Backend
cd backend
uv sync
uv run pytest -m 'not live'     # drop -m to include live AI tests
uv run uvicorn app.main:app --reload

# Frontend
cd frontend
npm install
npm test            # unit tests
npm run test:e2e    # Playwright
npm run build       # static export served by the backend
```

## Layout

- `frontend/` - Next.js app
- `backend/` - FastAPI app and tests
- `scripts/` - start and stop scripts
- `docs/` - plan and database schema
