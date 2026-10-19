import { describe, expect, it } from "vitest";
import {
  addCard,
  deleteCard,
  findColumnId,
  formatDueDate,
  matchesFilter,
  moveCard,
  newCard,
  overdueCardIds,
  parseLabels,
  renameColumn,
  today,
  updateCard,
} from "./board";
import { initialBoard } from "@/test/sampleBoard";

const ids = (board: typeof initialBoard, columnId: string) =>
  board.columns.find((c) => c.id === columnId)!.cardIds;

describe("initialBoard", () => {
  it("has 5 columns and every card referenced exists", () => {
    expect(initialBoard.columns).toHaveLength(5);
    const referenced = initialBoard.columns.flatMap((c) => c.cardIds);
    expect(referenced.sort()).toEqual(Object.keys(initialBoard.cards).sort());
  });
});

describe("findColumnId", () => {
  it("resolves a column id or a card id to its column", () => {
    expect(findColumnId(initialBoard, "todo")).toBe("todo");
    expect(findColumnId(initialBoard, "c6")).toBe("progress");
    expect(findColumnId(initialBoard, "nope")).toBeUndefined();
  });
});

describe("renameColumn", () => {
  it("renames only the target column without mutating input", () => {
    const next = renameColumn(initialBoard, "review", "QA");
    expect(next.columns.find((c) => c.id === "review")!.title).toBe("QA");
    expect(next.columns.find((c) => c.id === "done")!.title).toBe("Done");
    expect(initialBoard.columns.find((c) => c.id === "review")!.title).toBe("Review");
  });
});

describe("addCard", () => {
  it("appends the card to the end of the column", () => {
    const card = newCard("new", { title: "New", details: "Details" });
    const next = addCard(initialBoard, "todo", card);
    expect(ids(next, "todo")).toEqual(["c4", "c5", "new"]);
    expect(next.cards.new).toEqual(card);
    expect(initialBoard.cards.new).toBeUndefined();
  });
});

describe("updateCard", () => {
  it("updates the given fields without moving or mutating", () => {
    const next = updateCard(initialBoard, "c4", { title: "Onboarding v2", details: "New details", priority: "low" });
    expect(next.cards.c4).toEqual({
      ...initialBoard.cards.c4,
      title: "Onboarding v2",
      details: "New details",
      priority: "low",
    });
    expect(ids(next, "todo")).toEqual(["c4", "c5"]);
    expect(initialBoard.cards.c4.title).toBe("Onboarding flow");
  });
});

describe("deleteCard", () => {
  it("removes the card from cards and its column", () => {
    const next = deleteCard(initialBoard, "c2");
    expect(ids(next, "backlog")).toEqual(["c1", "c3"]);
    expect(next.cards.c2).toBeUndefined();
    expect(initialBoard.cards.c2).toBeDefined();
  });
});

describe("moveCard", () => {
  it("reorders within a column", () => {
    const next = moveCard(initialBoard, "c1", "backlog", 2);
    expect(ids(next, "backlog")).toEqual(["c2", "c3", "c1"]);
  });

  it("moves across columns at a given index", () => {
    const next = moveCard(initialBoard, "c1", "review", 0);
    expect(ids(next, "backlog")).toEqual(["c2", "c3"]);
    expect(ids(next, "review")).toEqual(["c1", "c8"]);
  });

  it("moves into an empty column", () => {
    const emptied = deleteCard(initialBoard, "c8");
    const next = moveCard(emptied, "c4", "review", 0);
    expect(ids(next, "review")).toEqual(["c4"]);
    expect(ids(next, "todo")).toEqual(["c5"]);
  });

  it("does not mutate the input", () => {
    moveCard(initialBoard, "c1", "done", 0);
    expect(ids(initialBoard, "backlog")).toEqual(["c1", "c2", "c3"]);
    expect(ids(initialBoard, "done")).toEqual(["c9", "c10"]);
  });
});

describe("newCard", () => {
  it("fills in empty optional fields", () => {
    expect(newCard("x", { title: "T" })).toEqual({
      id: "x",
      title: "T",
      details: "",
      priority: null,
      dueDate: null,
      labels: [],
    });
  });

  it("keeps given fields", () => {
    expect(newCard("x", { title: "T", priority: "high", labels: ["a"] })).toMatchObject({ priority: "high", labels: ["a"] });
  });
});

describe("parseLabels", () => {
  it("splits on commas, trims and drops blanks and duplicates", () => {
    expect(parseLabels(" design, ,backend,design ")).toEqual(["design", "backend"]);
    expect(parseLabels("")).toEqual([]);
  });
});

describe("matchesFilter", () => {
  const card = newCard("x", { title: "Ship API", details: "Rate limits", priority: "high", labels: ["Backend"] });

  it("matches everything with an empty filter", () => {
    expect(matchesFilter(card, { query: "", priority: "" })).toBe(true);
    expect(matchesFilter(card, { query: "   ", priority: "" })).toBe(true);
  });

  it("searches title, details and labels case-insensitively", () => {
    expect(matchesFilter(card, { query: "ship", priority: "" })).toBe(true);
    expect(matchesFilter(card, { query: "RATE", priority: "" })).toBe(true);
    expect(matchesFilter(card, { query: "backend", priority: "" })).toBe(true);
    expect(matchesFilter(card, { query: "frontend", priority: "" })).toBe(false);
  });

  it("filters by priority", () => {
    expect(matchesFilter(card, { query: "", priority: "high" })).toBe(true);
    expect(matchesFilter(card, { query: "", priority: "low" })).toBe(false);
    expect(matchesFilter(newCard("y", { title: "No priority" }), { query: "", priority: "low" })).toBe(false);
  });

  it("combines query and priority", () => {
    expect(matchesFilter(card, { query: "ship", priority: "low" })).toBe(false);
  });
});

describe("dates", () => {
  it("formats today as a local YYYY-MM-DD date", () => {
    expect(today(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });

  it("formats due dates without time zone shifts", () => {
    expect(formatDueDate("2026-11-06")).toBe("Nov 6");
    expect(formatDueDate("2026-01-01")).toBe("Jan 1");
  });

  it("lists cards due before the given day, ignoring done cards", () => {
    // Sample due dates: c2 2026-11-06, c4 2026-11-13, c6 2026-10-30.
    expect(overdueCardIds(initialBoard, "2026-10-30")).toEqual([]);
    expect(overdueCardIds(initialBoard, "2026-11-07")).toEqual(["c2", "c6"]);
    const done = moveCard(initialBoard, "c6", "done", 0);
    expect(overdueCardIds(done, "2026-12-01")).toEqual(["c2", "c4"]);
  });
});
