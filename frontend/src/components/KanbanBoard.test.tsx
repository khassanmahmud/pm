import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Board } from "@/lib/board";
import { initialBoard } from "@/test/sampleBoard";
import { KanbanBoard } from "./KanbanBoard";

function renderBoard() {
  const onChange = vi.fn();
  function Harness() {
    const [board, setBoard] = useState(initialBoard);
    return (
      <KanbanBoard
        board={board}
        onChange={(next: Board, persist?: boolean) => {
          setBoard(next);
          onChange(next, persist);
        }}
        onLogout={() => {}}
      />
    );
  }
  render(<Harness />);
  return onChange;
}

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
    const onChange = renderBoard();
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
    const onChange = renderBoard();
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
    const onChange = renderBoard();
    const input = within(screen.getByTestId("column-review")).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "QA{Enter}");
    expect(input).not.toHaveFocus();
    expect(saves(onChange)).toHaveLength(1);
    expect(saves(onChange)[0][0].columns[3].title).toBe("QA");
  });
});
