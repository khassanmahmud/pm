# Project Management App

Kanban boards with an AI assistant. Create an account, keep several boards, manage cards across five columns with drag and drop, and ask the AI chat sidebar to create, edit, move or prioritize cards for you.

## Features

- Accounts: sign up, sign in, change password, delete account (demo account `user` / `password` is always available)
- Multiple boards per user: create (empty or with sample cards), switch, rename, delete
- Five fixed, renameable columns per board
- Cards with details, priority, due date and labels; add, edit, delete and drag and drop
- Search and priority filter; overdue cards flagged; board progress and overdue counts
- AI chat sidebar per board that answers questions about the board and updates it
- Data saved in SQLite, kept across restarts

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

Open http://localhost:8000 (bound to localhost only) and create an account or sign in with `user` / `password`. Stop with `./scripts/stop.sh` or `.\scripts\stop.ps1`.

Data lives in the Docker volume `pm-data`; `docker volume rm pm-data` resets it.

## Development

```bash
# Backend
cd backend
uv sync
uv run pytest -m 'not live'     # drop -m to include live AI tests; add --cov=app for coverage
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
