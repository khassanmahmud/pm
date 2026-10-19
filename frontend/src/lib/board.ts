export type Priority = "low" | "medium" | "high";
export type Card = {
  id: string;
  title: string;
  details: string;
  priority: Priority | null;
  dueDate: string | null; // YYYY-MM-DD
  labels: string[];
};
export type Column = { id: string; title: string; cardIds: string[] };
export type Board = { columns: Column[]; cards: Record<string, Card> };
export type BoardSummary = { id: number; name: string; cardCount: number; updatedAt: string };
export type CardFields = Omit<Card, "id">;
export type Filter = { query: string; priority: Priority | "" };

export const PRIORITIES: Priority[] = ["high", "medium", "low"];
export const DONE_COLUMN = "done";

export function newCard(id: string, fields: Partial<CardFields> & { title: string }): Card {
  return { details: "", priority: null, dueDate: null, labels: [], ...fields, id };
}

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

export function updateCard(board: Board, cardId: string, fields: Partial<CardFields>): Board {
  return { ...board, cards: { ...board.cards, [cardId]: { ...board.cards[cardId], ...fields } } };
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

/** Comma-separated input to a list of unique, trimmed labels. */
export function parseLabels(text: string): string[] {
  return [...new Set(text.split(",").map((l) => l.trim()).filter(Boolean))];
}

export function matchesFilter(card: Card, { query, priority }: Filter): boolean {
  if (priority && card.priority !== priority) return false;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [card.title, card.details, ...card.labels].some((text) => text.toLowerCase().includes(q));
}

/** Local date as YYYY-MM-DD, comparable with due dates as strings. */
export function today(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function overdueCardIds(board: Board, on = today()): string[] {
  return board.columns
    .filter((c) => c.id !== DONE_COLUMN)
    .flatMap((c) => c.cardIds)
    .filter((id) => {
      const due = board.cards[id].dueDate;
      return due !== null && due < on;
    });
}

export function formatDueDate(dueDate: string): string {
  const [year, month, day] = dueDate.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
