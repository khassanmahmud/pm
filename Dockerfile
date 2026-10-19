FROM node:24-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend ./
# The test fixture imports the default board; next build type-checks it.
COPY backend/app/default_board.json /app/backend/app/default_board.json
RUN npm run build

FROM ghcr.io/astral-sh/uv:python3.13-trixie-slim
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_NO_DEV=1

WORKDIR /app/backend
COPY backend/pyproject.toml backend/uv.lock backend/.python-version ./
RUN uv sync --locked --no-install-project

COPY backend/app ./app
COPY --from=frontend /app/frontend/out /app/frontend/out

EXPOSE 8000
CMD ["uv", "run", "--no-sync", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
