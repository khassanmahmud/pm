import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Board } from "@/lib/board";
import { initialBoard } from "@/test/sampleBoard";
import { KanbanBoard } from "./KanbanBoard";

function renderBoard(start: Board = initialBoard) {
  const onChange = vi.fn();
  const onRename = vi.fn();
  const onDelete = vi.fn();
  function Harness() {
    const [board, setBoard] = useState(start);
    return (
      <KanbanBoard
        name="Product Launch"
        board={board}
        onChange={(next: Board, persist?: boolean) => {
          setBoard(next);
          onChange(next, persist);
        }}
        onRename={onRename}
        onDelete={onDelete}
      />
    );
  }
  render(<Harness />);
  return { onChange, onRename, onDelete };
}

const columnCards = (id: string) =>
  [...screen.getByTestId(`column-${id}`).querySelectorAll("li")].map((li) => li.dataset.testid);

const saves = (onChange: ReturnType<typeof vi.fn>) => onChange.mock.calls.filter(([, persist]) => persist !== false);

describe("KanbanBoard", () => {
  it("renders 5 columns with dummy cards", () => {
    renderBoard();
    expect(screen.getAllByLabelText("Column title")).toHaveLength(5);
    expect(screen.getByText("Competitor research")).toBeInTheDocument();
    expect(screen.getByText("10 cards across 5 columns")).toBeInTheDocument();
  });

  it("renames a column", async () => {
    renderBoard();
    const input = within(screen.getByTestId("column-review")).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "QA");
    expect(input).toHaveValue("QA");
  });

  it("adds a card to a column", async () => {
    renderBoard();
    const column = within(screen.getByTestId("column-todo"));
    await userEvent.click(column.getByRole("button", { name: /add a card/i }));
    await userEvent.type(column.getByLabelText("Card title"), "Write tests");
    await userEvent.type(column.getByLabelText("Card details"), "Cover everything");
    await userEvent.click(column.getByRole("button", { name: "Add card" }));
    expect(column.getByText("Write tests")).toBeInTheDocument();
    expect(column.getByText("Cover everything")).toBeInTheDocument();
    expect(column.getByText("3")).toBeInTheDocument();
    expect(column.queryByLabelText("Card title")).not.toBeInTheDocument();
  });

  it("cancels adding a card", async () => {
    renderBoard();
    const column = within(screen.getByTestId("column-todo"));
    await userEvent.click(column.getByRole("button", { name: /add a card/i }));
    await userEvent.click(column.getByRole("button", { name: "Cancel" }));
    expect(column.queryByLabelText("Card title")).not.toBeInTheDocument();
  });

  it("deletes a card", async () => {
    renderBoard();
    await userEvent.click(screen.getByRole("button", { name: "Delete SSO integration" }));
    expect(screen.queryByText("SSO integration")).not.toBeInTheDocument();
    expect(screen.getByText("9 cards across 5 columns")).toBeInTheDocument();
  });

  it("edits a card", async () => {
    renderBoard();
    await userEvent.click(screen.getByRole("button", { name: "Edit Onboarding flow" }));
    const title = screen.getByLabelText("Edit card title");
    await userEvent.clear(title);
    await userEvent.type(title, "Onboarding v2");
    const details = screen.getByLabelText("Edit card details");
    await userEvent.clear(details);
    await userEvent.type(details, "Two steps only");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    const column = within(screen.getByTestId("column-todo"));
    expect(column.getByText("Onboarding v2")).toBeInTheDocument();
    expect(column.getByText("Two steps only")).toBeInTheDocument();
    expect(screen.queryByText("Onboarding flow")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Edit card title")).not.toBeInTheDocument();
  });

  it("cancels editing a card without changes", async () => {
    renderBoard();
    await userEvent.click(screen.getByRole("button", { name: "Edit Onboarding flow" }));
    const title = screen.getByLabelText("Edit card title");
    await userEvent.clear(title);
    await userEvent.type(title, "Discarded");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Onboarding flow")).toBeInTheDocument();
    expect(screen.queryByText("Discarded")).not.toBeInTheDocument();
  });

  it("allows typing spaces while editing", async () => {
    renderBoard();
    await userEvent.click(screen.getByRole("button", { name: "Edit Onboarding flow" }));
    const title = screen.getByLabelText("Edit card title");
    await userEvent.type(title, " now");
    expect(title).toHaveValue("Onboarding flow now");
  });

  it("saves each card change", async () => {
    const { onChange } = renderBoard();
    const column = within(screen.getByTestId("column-todo"));
    await userEvent.click(column.getByRole("button", { name: /add a card/i }));
    await userEvent.type(column.getByLabelText("Card title"), "New");
    await userEvent.click(column.getByRole("button", { name: "Add card" }));
    expect(saves(onChange)).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: "Edit Onboarding flow" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(saves(onChange)).toHaveLength(2);

    await userEvent.click(screen.getByRole("button", { name: "Delete SSO integration" }));
    expect(saves(onChange)).toHaveLength(3);
    expect(saves(onChange)[2][0].cards.c9).toBeUndefined();
  });

  it("does not save a rename while typing, only on blur", async () => {
    const { onChange } = renderBoard();
    const input = within(screen.getByTestId("column-review")).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "QA");
    expect(onChange.mock.calls.length).toBeGreaterThan(0);
    expect(saves(onChange)).toHaveLength(0);
    await userEvent.tab();
    expect(saves(onChange)).toHaveLength(1);
    expect(saves(onChange)[0][0].columns[3].title).toBe("QA");
  });

  it("saves a rename on Enter", async () => {
    const { onChange } = renderBoard();
    const input = within(screen.getByTestId("column-review")).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "QA{Enter}");
    expect(input).not.toHaveFocus();
    expect(saves(onChange)).toHaveLength(1);
    expect(saves(onChange)[0][0].columns[3].title).toBe("QA");
  });

  it("shows the board name and stats", () => {
    renderBoard();
    expect(screen.getByRole("heading", { name: "Product Launch" })).toBeInTheDocument();
    expect(screen.getByText(/20% done/)).toBeInTheDocument();
  });

  it("edits priority, due date and labels", async () => {
    const { onChange } = renderBoard();
    await userEvent.click(screen.getByRole("button", { name: "Edit Mobile app spike" }));
    await userEvent.selectOptions(screen.getByLabelText("Priority"), "high");
    await userEvent.type(screen.getByLabelText("Due date"), "2030-01-15");
    await userEvent.clear(screen.getByLabelText("Labels"));
    await userEvent.type(screen.getByLabelText("Labels"), "mobile, spike, mobile");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(saves(onChange)[0][0].cards.c3).toMatchObject({
      priority: "high",
      dueDate: "2030-01-15",
      labels: ["mobile", "spike"],
    });
    const card = within(screen.getByTestId("card-c3"));
    expect(card.getByText("high")).toBeInTheDocument();
    expect(card.getByText("Due Jan 15")).toBeInTheDocument();
    expect(card.getByText("spike")).toBeInTheDocument();
  });

  it("clears priority and due date", async () => {
    const { onChange } = renderBoard();
    await userEvent.click(screen.getByRole("button", { name: "Edit Onboarding flow" }));
    await userEvent.selectOptions(screen.getByLabelText("Priority"), "");
    await userEvent.clear(screen.getByLabelText("Due date"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(saves(onChange)[0][0].cards.c4).toMatchObject({ priority: null, dueDate: null });
  });

  it("marks overdue cards outside the done column", () => {
    const board = structuredClone(initialBoard);
    for (const card of Object.values(board.cards)) card.dueDate = null;
    board.cards.c1.dueDate = "2000-01-01";
    board.cards.c9.dueDate = "2000-01-01";
    renderBoard(board);
    expect(within(screen.getByTestId("card-c1")).getByText("Overdue Jan 1")).toBeInTheDocument();
    expect(within(screen.getByTestId("card-c9")).getByText("Due Jan 1")).toBeInTheDocument();
    expect(screen.getByText(/1 overdue/)).toBeInTheDocument();
  });

  it("filters cards by search text", async () => {
    renderBoard();
    await userEvent.type(screen.getByLabelText("Search cards"), "design");
    // Matches labels (c4, c5, c10) and details text ("Design a three-step...").
    expect(columnCards("todo")).toEqual(["card-c4", "card-c5"]);
    expect(columnCards("backlog")).toEqual([]);
    expect(columnCards("done")).toEqual(["card-c10"]);
    expect(within(screen.getByTestId("column-done")).getByText("1/2")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(columnCards("backlog")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
  });

  it("filters cards by priority", async () => {
    renderBoard();
    await userEvent.selectOptions(screen.getByLabelText("Filter by priority"), "high");
    expect(columnCards("backlog")).toEqual(["card-c2"]);
    expect(columnCards("todo")).toEqual(["card-c4"]);
    expect(columnCards("progress")).toEqual(["card-c6"]);
    expect(columnCards("done")).toEqual([]);
  });

  it("does not change the board when filtering", async () => {
    const { onChange } = renderBoard();
    await userEvent.type(screen.getByLabelText("Search cards"), "zzz");
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText("10 cards across 5 columns")).toBeInTheDocument();
  });

  it("renames the board", async () => {
    const { onRename } = renderBoard();
    await userEvent.click(screen.getByRole("button", { name: "Rename" }));
    const input = screen.getByLabelText("Board name");
    expect(input).toHaveValue("Product Launch");
    await userEvent.clear(input);
    await userEvent.type(input, "  Launch v2 {Enter}");
    expect(onRename).toHaveBeenCalledWith("Launch v2");
    expect(screen.queryByLabelText("Board name")).not.toBeInTheDocument();
  });

  it("does not rename when the name is unchanged or cancelled", async () => {
    const { onRename } = renderBoard();
    await userEvent.click(screen.getByRole("button", { name: "Rename" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await userEvent.click(screen.getByRole("button", { name: "Rename" }));
    await userEvent.type(screen.getByLabelText("Board name"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onRename).not.toHaveBeenCalled();
  });

  it("asks for confirmation before deleting the board", async () => {
    const { onDelete } = renderBoard();
    await userEvent.click(screen.getByRole("button", { name: "Delete board" }));
    await userEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(onDelete).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Delete board" }));
    expect(screen.getByText("Delete this board?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it("is inert while locked", () => {
    render(
      <KanbanBoard name="B" board={initialBoard} onChange={() => {}} onRename={() => {}} onDelete={() => {}} locked />,
    );
    expect(screen.getByRole("main")).toHaveAttribute("inert");
  });
});
