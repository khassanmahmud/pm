import os
import secrets
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from openai import OpenAIError
from pydantic import BaseModel
from starlette.middleware.sessions import SessionMiddleware

from app import ai, db
from app.models import Board

STATIC_DIR = Path(__file__).parents[2] / "frontend" / "out"
USERS = {"user": "password"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    yield


app = FastAPI(lifespan=lifespan)
app.add_middleware(SessionMiddleware, secret_key=os.environ.get("SESSION_SECRET", secrets.token_hex(32)))


class Credentials(BaseModel):
    username: str
    password: str


class ChatRequest(BaseModel):
    message: str
    history: list[ai.ChatMessage] = []


class ChatResponse(BaseModel):
    reply: str
    board: Board | None


def current_user(request: Request) -> str:
    username = request.session.get("username")
    if not username:
        raise HTTPException(status_code=401, detail="Not signed in")
    return username


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/login")
def login(credentials: Credentials, request: Request):
    if USERS.get(credentials.username) != credentials.password:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    request.session["username"] = credentials.username
    return {"username": credentials.username}


@app.post("/api/logout")
def logout(request: Request):
    request.session.clear()
    return {"status": "ok"}


@app.get("/api/me")
def me(username: str = Depends(current_user)):
    return {"username": username}


@app.get("/api/board")
def get_board(username: str = Depends(current_user)) -> Board:
    return db.get_board(username)


@app.put("/api/board")
def put_board(board: Board, username: str = Depends(current_user)) -> Board:
    db.save_board(username, board)
    return board


@app.post("/api/chat")
def chat(request: ChatRequest, username: str = Depends(current_user)) -> ChatResponse:
    current = db.get_board(username)
    result = None
    # The model occasionally returns a malformed board or fails outright; retry once before giving up.
    for _ in range(2):
        try:
            result = ai.chat(current, request.history, request.message)
            if result.board is None:
                return ChatResponse(reply=result.reply, board=None)
            board = result.board.to_board()
        except (ValueError, OpenAIError):  # ValueError includes pydantic ValidationError
            continue
        db.save_board(username, board)
        return ChatResponse(reply=result.reply, board=board)
    if result is None:
        raise HTTPException(status_code=502, detail="The AI did not respond")
    return ChatResponse(reply=result.reply + "\n\n(The board update was invalid and was not applied.)", board=None)


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True, check_dir=False), name="static")
