export type Card = { id: string; title: string; details: string };
export type Column = { id: string; title: string; cardIds: string[] };
export type Board = { columns: Column[]; cards: Record<string, Card> };

export function findColumnId(board: Board, id: string): string | undefined {
  if (board.columns.some((c) => c.id === id)) return id;
  return board.columns.find((c) => c.cardIds.includes(id))?.id;
}

export function renameColumn(board: Board, columnId: string, title: string): Board {
  return {
    ...board,
    columns: board.columns.map((c) => (c.id === columnId ? { ...c, title } : c)),
  };
}

export function addCard(board: Board, columnId: string, card: Card): Board {
  return {
    cards: { ...board.cards, [card.id]: card },
    columns: board.columns.map((c) =>
      c.id === columnId ? { ...c, cardIds: [...c.cardIds, card.id] } : c,
    ),
  };
}

export function updateCard(board: Board, cardId: string, title: string, details: string): Board {
  return { ...board, cards: { ...board.cards, [cardId]: { id: cardId, title, details } } };
}

export function deleteCard(board: Board, cardId: string): Board {
  const cards = { ...board.cards };
  delete cards[cardId];
  return {
    cards,
    columns: board.columns.map((c) => ({
      ...c,
      cardIds: c.cardIds.filter((id) => id !== cardId),
    })),
  };
}

export function moveCard(board: Board, cardId: string, toColumnId: string, toIndex: number): Board {
  const columns = board.columns.map((c) => ({
    ...c,
    cardIds: c.cardIds.filter((id) => id !== cardId),
  }));
  const target = columns.find((c) => c.id === toColumnId)!;
  target.cardIds.splice(toIndex, 0, cardId);
  return { ...board, columns };
}
