from datetime import date
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

COLUMN_IDS = ["backlog", "todo", "progress", "review", "done"]

Priority = Literal["low", "medium", "high"]


class Card(BaseModel):
    id: str
    title: str
    details: str
    priority: Priority | None = None
    # ISO date (YYYY-MM-DD). A plain string keeps "format" out of the AI's JSON schema.
    dueDate: str | None = None
    labels: list[str] = Field(default_factory=list)

    @field_validator("dueDate")
    @classmethod
    def check_due_date(cls, value: str | None) -> str | None:
        if value is not None:
            date.fromisoformat(value)
        return value


class Column(BaseModel):
    id: str
    title: str
    cardIds: list[str]


class Board(BaseModel):
    columns: list[Column]
    cards: dict[str, Card]

    @model_validator(mode="after")
    def check_consistency(self):
        if [c.id for c in self.columns] != COLUMN_IDS:
            raise ValueError(f"columns must be {COLUMN_IDS} in order")
        placed = [card_id for c in self.columns for card_id in c.cardIds]
        if len(placed) != len(set(placed)):
            raise ValueError("a card appears more than once")
        if set(placed) != set(self.cards):
            raise ValueError("cards and column cardIds do not match")
        for key, card in self.cards.items():
            if card.id != key:
                raise ValueError(f"card key {key} does not match id {card.id}")
        return self


EMPTY_BOARD = Board(
    columns=[
        Column(id=id, title=title, cardIds=[])
        for id, title in zip(COLUMN_IDS, ["Backlog", "To Do", "In Progress", "Review", "Done"])
    ],
    cards={},
)

# Seeded for new users and used for sample boards.
DEFAULT_BOARD = Board.model_validate_json((Path(__file__).parent / "default_board.json").read_text())


class BoardSummary(BaseModel):
    id: int
    name: str
    cardCount: int
    updatedAt: str
