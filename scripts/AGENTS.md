# Scripts

Build the Docker image and run the app as container `pm-app` on http://localhost:8000. `.env` in the project root is passed to the container if present. The SQLite database lives in the Docker volume `pm-data` (mounted at `/app/backend/data`), so data survives restarts; `docker volume rm pm-data` resets it.

- Mac/Linux: `./scripts/start.sh`, `./scripts/stop.sh`
- Windows (PowerShell): `.\scripts\start.ps1`, `.\scripts\stop.ps1`

Start rebuilds the image and replaces any running container. Stop removes the container.
