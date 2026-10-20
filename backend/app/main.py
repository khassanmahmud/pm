import os
import secrets
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from openai import OpenAIError
from pydantic import BaseModel, StringConstraints
from starlette.middleware.sessions import SessionMiddleware

from app import ai, db
from app.models import DEFAULT_BOARD, EMPTY_BOARD, Board, BoardSummary

STATIC_DIR = Path(__file__).parents[2] / "frontend" / "out"

Username = Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^[A-Za-z0-9_.-]{3,32}$")]
Password = Annotated[str, StringConstraints(min_length=8, max_length=128)]
BoardName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    yield


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    SessionMiddleware, secret_key=os.environ.get("SESSION_SECRET", secrets.token_hex(32)), same_site="strict"
)


class Credentials(BaseModel):
    username: str
    password: str


class Registration(BaseModel):
    username: Username
    password: Password


class PasswordChange(BaseModel):
    currentPassword: str
    newPassword: Password


class AccountDeletion(BaseModel):
    password: str


class NewBoard(BaseModel):
    name: BoardName
    # Start from the sample board instead of an empty one.
    sample: bool = False


class BoardRename(BaseModel):
    name: BoardName


class ChatRequest(BaseModel):
    message: str
    history: list[ai.ChatMessage] = []


class ChatResponse(BaseModel):
    reply: str
    board: Board | None


class User(BaseModel):
    id: int
    username: str


def current_user(request: Request) -> User:
    user_id = request.session.get("user_id")
    username = user_id and db.get_username(user_id)
    if not username:
        request.session.clear()  # the account may have been deleted
        raise HTTPException(status_code=401, detail="Not signed in")
    return User(id=user_id, username=username)


CurrentUser = Annotated[User, Depends(current_user)]


def sign_in(request: Request, user_id: int, username: str) -> dict:
    request.session.clear()
    request.session["user_id"] = user_id
    return {"username": username}


def missing() -> HTTPException:
    # Also used for boards owned by other users, so their ids are not revealed.
    return HTTPException(status_code=404, detail="Board not found")


def found[T](value: T | None) -> T:
    if value is None:
        raise missing()
    return value


@app.get("/api/health")
def health():
    return {"status": "ok"}


# Auth and account


@app.post("/api/login")
def login(credentials: Credentials, request: Request):
    user = db.authenticate(credentials.username, credentials.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return sign_in(request, *user)


@app.post("/api/register", status_code=201)
def register(registration: Registration, request: Request):
    try:
        user_id = db.create_user(registration.username, registration.password)
    except db.UsernameTaken:
        raise HTTPException(status_code=409, detail="Username is already taken") from None
    return sign_in(request, user_id, registration.username)


@app.post("/api/logout")
def logout(request: Request):
    request.session.clear()
    return {"status": "ok"}


@app.get("/api/me")
def me(user: CurrentUser):
    return {"username": user.username}


@app.post("/api/account/password")
def change_password(change: PasswordChange, user: CurrentUser):
    if not db.check_password(user.id, change.currentPassword):
        raise HTTPException(status_code=403, detail="Current password is incorrect")
    db.set_password(user.id, change.newPassword)
    return {"status": "ok"}


@app.delete("/api/account", status_code=204)
def delete_account(deletion: AccountDeletion, request: Request, user: CurrentUser):
    if not db.check_password(user.id, deletion.password):
        raise HTTPException(status_code=403, detail="Password is incorrect")
    db.delete_user(user.id)
    request.session.clear()


# Boards


@app.get("/api/boards")
def list_boards(user: CurrentUser) -> list[BoardSummary]:
    return db.list_boards(user.id)


@app.post("/api/boards", status_code=201)
def create_board(new: NewBoard, user: CurrentUser) -> BoardSummary:
    board = DEFAULT_BOARD if new.sample else EMPTY_BOARD
    return db.create_board(user.id, new.name, board)


@app.patch("/api/boards/{board_id}")
def rename_board(board_id: int, rename: BoardRename, user: CurrentUser) -> BoardSummary:
    return found(db.rename_board(user.id, board_id, rename.name))


@app.delete("/api/boards/{board_id}", status_code=204)
def delete_board(board_id: int, user: CurrentUser):
    if not db.delete_board(user.id, board_id):
        raise missing()


@app.get("/api/boards/{board_id}")
def get_board(board_id: int, user: CurrentUser) -> Board:
    return found(db.get_board(user.id, board_id))


@app.put("/api/boards/{board_id}")
def put_board(board_id: int, board: Board, user: CurrentUser) -> Board:
    if not db.save_board(user.id, board_id, board):
        raise missing()
    return board


@app.post("/api/boards/{board_id}/chat")
def chat(board_id: int, request: ChatRequest, user: CurrentUser) -> ChatResponse:
    current = found(db.get_board(user.id, board_id))
    result = None
    # The model occasionally returns a malformed board or fails outright; retry once before giving up.
    for _ in range(2):
        try:
            result = ai.chat(current, request.history, request.message)
            board = result.board.to_board() if result.board else None
        except (ValueError, OpenAIError):  # ValueError includes pydantic ValidationError
            continue
        if board is not None:
            db.save_board(user.id, board_id, board)
        return ChatResponse(reply=result.reply, board=board)
    if result is None:
        raise HTTPException(status_code=502, detail="The AI did not respond")
    return ChatResponse(reply=result.reply + "\n\n(The board update was invalid and was not applied.)", board=None)


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True, check_dir=False), name="static")
