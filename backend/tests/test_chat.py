import json
from datetime import date
from types import SimpleNamespace

import pytest
from openai import APIConnectionError

from app import ai, main
from app.ai import AIBoard, AIResponse, ChatMessage
from app.db import DEFAULT_BOARD
from app.models import Board
from conftest import live

DEFAULT = Board.model_validate_json(DEFAULT_BOARD)

# Every test starts with a fresh database, where the demo user's default board has id 1.
board_url = "/api/boards/1"
chat_url = f"{board_url}/chat"


def ai_board(board: Board) -> AIBoard:
    return AIBoard(columns=board.columns, cards=list(board.cards.values()))


@pytest.fixture
def fake_chat(monkeypatch):
    """Replace ai.chat. Set fake.response (or fake.responses, returned or raised in turn) and inspect fake.calls."""
    fake = SimpleNamespace(calls=[], response=AIResponse(reply="Hello", board=None), responses=None)

    def chat(board, history, message):
        fake.calls.append((board, history, message))
        result = fake.responses.pop(0) if fake.responses else fake.response
        if isinstance(result, Exception):
            raise result
        return result

    monkeypatch.setattr(main.ai, "chat", chat)
    return fake


def test_chat_requires_sign_in(client, fake_chat):
    assert client.post(chat_url, json={"message": "hi"}).status_code == 401
    assert fake_chat.calls == []


def test_chat_reply_only(signed_in, fake_chat):
    response = signed_in.post(chat_url, json={"message": "hi"})
    assert response.json() == {"reply": "Hello", "board": None}
    assert signed_in.get(board_url).json() == DEFAULT.model_dump()


def test_chat_sends_current_board_history_and_message(signed_in, fake_chat):
    board = DEFAULT.model_copy(deep=True)
    board.columns[0].title = "Ideas"
    signed_in.put(board_url, json=board.model_dump())
    history = [{"role": "user", "content": "hi"}, {"role": "assistant", "content": "Hello"}]
    signed_in.post(chat_url, json={"message": "next", "history": history})
    sent_board, sent_history, sent_message = fake_chat.calls[0]
    assert sent_board == board
    assert [m.model_dump() for m in sent_history] == history
    assert sent_message == "next"


def test_chat_board_update_saved(signed_in, fake_chat):
    board = DEFAULT.model_copy(deep=True)
    board.cards["c1"].title = "Updated by AI"
    fake_chat.response = AIResponse(reply="Done", board=ai_board(board))
    response = signed_in.post(chat_url, json={"message": "rename c1"})
    assert response.json() == {"reply": "Done", "board": board.model_dump()}
    assert signed_in.get(board_url).json() == board.model_dump()


def invalid_board() -> AIBoard:
    board = ai_board(DEFAULT)
    board.columns.pop()
    return board


def test_chat_reply_only_calls_ai_once(signed_in, fake_chat):
    signed_in.post(chat_url, json={"message": "hi"})
    assert len(fake_chat.calls) == 1


def test_chat_valid_board_calls_ai_once(signed_in, fake_chat):
    fake_chat.response = AIResponse(reply="Done", board=ai_board(DEFAULT))
    signed_in.post(chat_url, json={"message": "noop"})
    assert len(fake_chat.calls) == 1


def test_chat_retries_after_invalid_board(signed_in, fake_chat):
    board = DEFAULT.model_copy(deep=True)
    board.cards["c1"].title = "Second try"
    fake_chat.responses = [
        AIResponse(reply="Broken", board=invalid_board()),
        AIResponse(reply="Fixed", board=ai_board(board)),
    ]
    response = signed_in.post(chat_url, json={"message": "rename c1"})
    assert response.json() == {"reply": "Fixed", "board": board.model_dump()}
    assert len(fake_chat.calls) == 2
    assert fake_chat.calls[1][0] == DEFAULT
    assert signed_in.get(board_url).json() == board.model_dump()


def test_chat_retry_can_return_reply_only(signed_in, fake_chat):
    fake_chat.responses = [
        AIResponse(reply="Broken", board=invalid_board()),
        AIResponse(reply="Nothing to change", board=None),
    ]
    response = signed_in.post(chat_url, json={"message": "hmm"})
    assert response.json() == {"reply": "Nothing to change", "board": None}


def test_chat_invalid_twice_not_saved(signed_in, fake_chat):
    fake_chat.response = AIResponse(reply="Removed a column", board=invalid_board())
    response = signed_in.post(chat_url, json={"message": "delete done column"})
    assert response.status_code == 200
    assert response.json()["board"] is None
    assert "not applied" in response.json()["reply"]
    assert len(fake_chat.calls) == 2
    assert signed_in.get(board_url).json() == DEFAULT.model_dump()


def test_chat_duplicate_card_ids_not_saved(signed_in, fake_chat):
    dup = ai_board(DEFAULT)
    dup.cards.append(dup.cards[0].model_copy(update={"title": "Clash"}))
    fake_chat.response = AIResponse(reply="Added", board=dup)
    assert signed_in.post(chat_url, json={"message": "add"}).json()["board"] is None
    assert signed_in.get(board_url).json() == DEFAULT.model_dump()


def test_chat_retries_after_ai_error(signed_in, fake_chat):
    fake_chat.responses = [APIConnectionError(request=None), AIResponse(reply="Hello again", board=None)]
    assert signed_in.post(chat_url, json={"message": "hi"}).json() == {"reply": "Hello again", "board": None}
    assert len(fake_chat.calls) == 2


def test_chat_ai_error_twice_returns_502(signed_in, fake_chat):
    fake_chat.response = ValueError("no structured response")
    response = signed_in.post(chat_url, json={"message": "hi"})
    assert response.status_code == 502
    assert signed_in.get(board_url).json() == DEFAULT.model_dump()


def test_chat_rejects_bad_history_role(signed_in, fake_chat):
    response = signed_in.post(chat_url, json={"message": "hi", "history": [{"role": "system", "content": "x"}]})
    assert response.status_code == 422


def test_chat_unknown_board_is_404(signed_in, fake_chat):
    assert signed_in.post("/api/boards/999/chat", json={"message": "hi"}).status_code == 404
    assert fake_chat.calls == []


def test_chat_updates_only_its_board(signed_in, fake_chat):
    other = signed_in.post("/api/boards", json={"name": "Other"}).json()["id"]
    board = DEFAULT.model_copy(deep=True)
    board.cards["c1"].priority = "high"
    fake_chat.response = AIResponse(reply="Done", board=ai_board(board))
    signed_in.post(f"/api/boards/{other}/chat", json={"message": "copy"})
    assert fake_chat.calls[0][0].cards == {}  # the AI saw the empty board
    assert signed_in.get(f"/api/boards/{other}").json() == board.model_dump()
    assert signed_in.get(board_url).json() == DEFAULT.model_dump()


def test_ai_response_rejects_invalid_due_date():
    """The SDK parses the reply into AIResponse, so a bad date raises and the route retries."""
    data = AIResponse(reply="Set", board=ai_board(DEFAULT)).model_dump()
    data["board"]["cards"][0]["dueDate"] = "soon"
    with pytest.raises(ValueError):
        AIResponse.model_validate(data)


def test_ai_chat_builds_messages(monkeypatch):
    captured = {}

    def parse(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(parsed="parsed"))])

    fake_client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(parse=parse)))
    monkeypatch.setattr(ai, "client", lambda: fake_client)

    history = [ChatMessage(role="user", content="hi"), ChatMessage(role="assistant", content="Hello")]
    assert ai.chat(DEFAULT, history, "next") == "parsed"

    messages = captured["messages"]
    assert captured["model"] == "openai/gpt-oss-120b"
    assert captured["response_format"] is AIResponse
    assert messages[0]["role"] == "system"
    assert f"Today is {date.today().isoformat()}" in messages[0]["content"]
    board_json = messages[0]["content"].split("Current board:\n", 1)[1]
    assert AIBoard.model_validate_json(board_json).to_board() == DEFAULT
    assert messages[1:] == [
        {"role": "user", "content": "hi"},
        {"role": "assistant", "content": "Hello"},
        {"role": "user", "content": "next"},
    ]


def test_ai_chat_raises_when_nothing_parsed(monkeypatch):
    def parse(**kwargs):
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(parsed=None))])

    fake_client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(parse=parse)))
    monkeypatch.setattr(ai, "client", lambda: fake_client)
    with pytest.raises(ValueError):
        ai.chat(DEFAULT, [], "hi")


@live
def test_live_chat_question_without_change(signed_in):
    response = signed_in.post(chat_url, json={"message": "How many cards are in the Done column?"}).json()
    assert "2" in response["reply"] or "two" in response["reply"].lower()
    assert response["board"] is None


@live
def test_live_chat_adds_card(signed_in):
    response = signed_in.post(
        chat_url, json={"message": 'Add a card titled "Write release notes" to the To Do column.'}
    ).json()
    assert response["board"] is not None
    board = Board.model_validate(response["board"])
    todo = next(c for c in board.columns if c.id == "todo")
    assert "Write release notes" in [board.cards[i].title for i in todo.cardIds]
    assert len(board.cards) == len(DEFAULT.cards) + 1
    assert signed_in.get(board_url).json() == json.loads(board.model_dump_json())


@live
def test_live_chat_uses_history(signed_in):
    history = [
        {"role": "user", "content": "My favourite column is Review. Remember that."},
        {"role": "assistant", "content": "Got it, your favourite column is Review."},
    ]
    response = signed_in.post(
        chat_url, json={"message": "Which column is my favourite? Answer with just its name.", "history": history}
    ).json()
    assert "review" in response["reply"].lower()


@live
def test_live_chat_sets_card_fields(signed_in):
    message = 'Set "Mobile app spike" to high priority, due 2026-12-01, and add the label "mobile".'
    response = signed_in.post(chat_url, json={"message": message}).json()
    assert response["board"] is not None
    card = response["board"]["cards"]["c3"]
    assert card["priority"] == "high"
    assert card["dueDate"] == "2026-12-01"
    assert "mobile" in card["labels"]
