import { describe, expect, it } from "vitest";
import { addCard, deleteCard, findColumnId, moveCard, renameColumn, updateCard } from "./board";
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
    const card = { id: "new", title: "New", details: "Details" };
    const next = addCard(initialBoard, "todo", card);
    expect(ids(next, "todo")).toEqual(["c4", "c5", "new"]);
    expect(next.cards.new).toEqual(card);
    expect(initialBoard.cards.new).toBeUndefined();
  });
});

describe("updateCard", () => {
  it("updates title and details without moving or mutating", () => {
    const next = updateCard(initialBoard, "c4", "Onboarding v2", "New details");
    expect(next.cards.c4).toEqual({ id: "c4", title: "Onboarding v2", details: "New details" });
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
