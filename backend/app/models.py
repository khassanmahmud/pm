from pydantic import BaseModel, model_validator

COLUMN_IDS = ["backlog", "todo", "progress", "review", "done"]


class Card(BaseModel):
    id: str
    title: str
    details: str


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
