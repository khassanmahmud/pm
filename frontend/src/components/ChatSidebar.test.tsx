import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { initialBoard } from "@/test/sampleBoard";
import { ChatSidebar } from "./ChatSidebar";

type ChatBody = { message: string; history: { role: string; content: string }[] };

function mockChat(reply: (body: ChatBody) => { status?: number; reply?: string; board?: unknown }) {
  const bodies: ChatBody[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      bodies.push(body);
      const r = reply(body);
      return Response.json({ reply: r.reply ?? "", board: r.board ?? null }, { status: r.status ?? 200 });
    }),
  );
  return bodies;
}

function renderSidebar(beforeSend = () => Promise.resolve()) {
  const onBoardUpdate = vi.fn();
  render(<ChatSidebar onBoardUpdate={onBoardUpdate} beforeSend={beforeSend} />);
  return onBoardUpdate;
}

async function send(text: string) {
  await userEvent.type(screen.getByLabelText("Message"), text);
  await userEvent.click(screen.getByRole("button", { name: "Send" }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ChatSidebar", () => {
  it("shows a hint before any messages", () => {
    renderSidebar();
    expect(screen.getByText(/ask me to add, edit or move cards/i)).toBeInTheDocument();
  });

  it("sends a message and shows the reply", async () => {
    const bodies = mockChat(() => ({ reply: "There are 10 cards." }));
    renderSidebar();
    await send("How many cards?");
    expect(await screen.findByText("There are 10 cards.")).toBeInTheDocument();
    expect(screen.getByText("How many cards?")).toHaveAttribute("data-role", "user");
    expect(screen.getByText("There are 10 cards.")).toHaveAttribute("data-role", "assistant");
    expect(bodies).toEqual([{ message: "How many cards?", history: [] }]);
    expect(screen.getByLabelText("Message")).toHaveValue("");
  });

  it("sends the conversation history with each message", async () => {
    const bodies = mockChat(({ message }) => ({ reply: `re: ${message}` }));
    renderSidebar();
    await send("first");
    await screen.findByText("re: first");
    await send("second");
    await screen.findByText("re: second");
    expect(bodies[1]).toEqual({
      message: "second",
      history: [
        { role: "user", content: "first" },
        { role: "assistant", content: "re: first" },
      ],
    });
  });

  it("shows a loading indicator and disables send while waiting", async () => {
    let release!: () => void;
    const pending = new Promise<void>((r) => (release = r));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        await pending;
        return Response.json({ reply: "Done", board: null });
      }),
    );
    renderSidebar();
    await send("Do it");
    expect(screen.getByRole("status")).toHaveTextContent("Thinking");
    await userEvent.type(screen.getByLabelText("Message"), "more");
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    release();
    await screen.findByText("Done");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("passes AI board updates to the parent", async () => {
    const board = structuredClone(initialBoard);
    board.columns[0].title = "From AI";
    mockChat(() => ({ reply: "Renamed", board }));
    const onBoardUpdate = renderSidebar();
    await send("Rename backlog");
    await screen.findByText("Renamed");
    expect(onBoardUpdate).toHaveBeenCalledWith(board);
  });

  it("does not update the board when the AI returns none", async () => {
    mockChat(() => ({ reply: "Just answering" }));
    const onBoardUpdate = renderSidebar();
    await send("Question");
    await screen.findByText("Just answering");
    expect(onBoardUpdate).not.toHaveBeenCalled();
  });

  it("shows an error when the request fails", async () => {
    mockChat(() => ({ status: 500 }));
    renderSidebar();
    await send("Hello");
    expect(await screen.findByText(/could not respond/i)).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("waits for pending board saves before sending", async () => {
    let release!: () => void;
    const saves = new Promise<void>((r) => (release = r));
    const bodies = mockChat(() => ({ reply: "ok" }));
    renderSidebar(() => saves);
    await send("Hello");
    await new Promise((r) => setTimeout(r, 30));
    expect(bodies).toHaveLength(0);
    release();
    await waitFor(() => expect(bodies).toHaveLength(1));
  });

  it("sends on Enter and adds a newline on Shift+Enter", async () => {
    const bodies = mockChat(() => ({ reply: "ok" }));
    renderSidebar();
    const input = screen.getByLabelText("Message");
    await userEvent.type(input, "line one{Shift>}{Enter}{/Shift}line two");
    expect(bodies).toHaveLength(0);
    expect(input).toHaveValue("line one\nline two");
    await userEvent.type(input, "{Enter}");
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0].message).toBe("line one\nline two");
  });

  it("does not send an empty message", async () => {
    const bodies = mockChat(() => ({ reply: "ok" }));
    renderSidebar();
    await userEvent.type(screen.getByLabelText("Message"), "   {Enter}");
    expect(bodies).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("can be closed and reopened, keeping the conversation", async () => {
    mockChat(() => ({ reply: "Kept" }));
    renderSidebar();
    await send("Hi");
    await screen.findByText("Kept");
    await userEvent.click(screen.getByRole("button", { name: "Close assistant" }));
    expect(screen.queryByLabelText("Message")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "AI assistant" }));
    expect(screen.getByText("Kept")).toBeInTheDocument();
  });
});
