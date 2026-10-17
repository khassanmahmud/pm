import os
from typing import Literal

from openai import OpenAI
from pydantic import BaseModel

from app.models import Board, Card, Column

MODEL = "openai/gpt-oss-120b"

SYSTEM_PROMPT = """You are an assistant for a Kanban project board.
Answer the user's questions about the board and make changes when asked.

The board has five fixed columns (ids: backlog, todo, progress, review, done). Column titles may be renamed, \
but never add, remove or reorder columns or change their ids.
Each card belongs to exactly one column; a column's cardIds order is the card order.

If the user asks for a change, set "board" to the complete updated board, including every unchanged card. \
New cards need a unique id not already used on the board. If no change is needed, set "board" to null.
Keep "reply" short and tell the user what you changed.

Current board:
{board}"""


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class AIBoard(BaseModel):
    columns: list[Column]
    cards: list[Card]

    def to_board(self) -> Board:
        cards = {c.id: c for c in self.cards}
        if len(cards) != len(self.cards):
            raise ValueError("duplicate card ids")
        return Board(columns=self.columns, cards=cards)


class AIResponse(BaseModel):
    reply: str
    board: AIBoard | None


def client() -> OpenAI:
    # Normal calls take 10-20s. The chat route retries once itself, so skip the SDK's retries.
    return OpenAI(
        base_url="https://openrouter.ai/api/v1", api_key=os.environ["OPENROUTER_API_KEY"], timeout=60, max_retries=0
    )


def ask(prompt: str) -> str:
    response = client().chat.completions.create(model=MODEL, messages=[{"role": "user", "content": prompt}])
    return response.choices[0].message.content


def chat(board: Board, history: list[ChatMessage], message: str) -> AIResponse:
    ai_board = AIBoard(columns=board.columns, cards=list(board.cards.values()))
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT.format(board=ai_board.model_dump_json())},
        *(m.model_dump() for m in history),
        {"role": "user", "content": message},
    ]
    response = client().chat.completions.parse(
        model=MODEL,
        messages=messages,
        response_format=AIResponse,
        # Only route to providers that support structured outputs.
        extra_body={"provider": {"require_parameters": True}},
    )
    parsed = response.choices[0].message.parsed
    if parsed is None:  # refusal or empty content
        raise ValueError("no structured response")
    return parsed
