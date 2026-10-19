import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Board, BoardSummary } from "@/lib/board";
import { initialBoard } from "@/test/sampleBoard";
import { App } from "./App";

type Reply = { status: number; body?: unknown };
type Override = (init?: RequestInit) => Reply | Promise<Reply>;

const EMPTY: Board = {
  columns: initialBoard.columns.map((c) => ({ ...c, cardIds: [] })),
  cards: {},
};

/**
 * In-memory stand-in for the backend. `overrides` replace a route, keyed by "METHOD /url".
 * Returns the fetch mock and the server state for assertions.
 */
function fakeApi({ signedIn = true, overrides = {} as Record<string, Override> } = {}) {
  const state = {
    user: signedIn ? "user" : null,
    boards: [{ id: 1, name: "Product Launch", board: structuredClone(initialBoard), updatedAt: "t" }],
    nextId: 2,
  };
  const summary = ({ id, name, board, updatedAt }: (typeof state.boards)[number]): BoardSummary => ({
    id,
    name,
    cardCount: Object.keys(board.cards).length,
    updatedAt,
  });

  function handle(method: string, url: string, body: Record<string, unknown>): Reply {
    if (url === "/api/login") {
      if (body.password !== "password") return { status: 401 };
      state.user = body.username as string;
      return { status: 200, body: { username: state.user } };
    }
    if (url === "/api/register") {
      if (body.username === "user") return { status: 409 };
      state.user = body.username as string;
      return { status: 201, body: { username: state.user } };
    }
    if (url === "/api/logout") {
      state.user = null;
      return { status: 200 };
    }
    if (!state.user) return { status: 401 };
    if (url === "/api/me") return { status: 200, body: { username: state.user } };
    if (url === "/api/boards" && method === "GET") return { status: 200, body: state.boards.map(summary) };
    if (url === "/api/boards" && method === "POST") {
      const created = { id: state.nextId++, name: body.name as string, board: body.sample ? structuredClone(initialBoard) : EMPTY, updatedAt: "t" };
      state.boards.push(created);
      return { status: 201, body: summary(created) };
    }
    const match = url.match(/^\/api\/boards\/(\d+)(\/chat)?$/);
    const entry = match && state.boards.find((b) => b.id === Number(match[1]));
    if (!entry) return { status: 404 };
    if (match[2]) return { status: 200, body: { reply: "ok", board: null } };
    if (method === "GET") return { status: 200, body: entry.board };
    if (method === "PUT") {
      entry.board = body as Board;
      return { status: 200, body };
    }
    if (method === "PATCH") {
      entry.name = body.name as string;
      return { status: 200, body: summary(entry) };
    }
    state.boards = state.boards.filter((b) => b !== entry);
    return { status: 204 };
  }

  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const override = overrides[`${method} ${url}`];
    const { status, body } = override
      ? await override(init)
      : handle(method, url, init?.body ? JSON.parse(init.body as string) : {});
    return new Response(status === 204 ? null : JSON.stringify(body ?? {}), { status });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, state };
}

type FetchMock = ReturnType<typeof fakeApi>["fetchMock"];

const puts = (fetchMock: FetchMock) =>
  fetchMock.mock.calls
    .filter(([, init]) => init?.method === "PUT")
    .map(([url, init]) => ({ url, board: JSON.parse(init!.body as string) as Board }));

const nav = () => within(screen.getByRole("navigation", { name: "Boards" }));

async function signIn(username: string, password: string) {
  await userEvent.type(screen.getByLabelText("Username"), username);
  await userEvent.type(screen.getByLabelText("Password"), password);
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

async function sendChat(text: string) {
  await userEvent.type(screen.getByLabelText("Message"), text);
  await userEvent.click(screen.getByRole("button", { name: "Send" }));
}

async function createBoard(name: string, sample = false) {
  await userEvent.click(nav().getByRole("button", { name: /new board/i }));
  await userEvent.type(nav().getByLabelText("Board name"), name);
  if (sample) await userEvent.click(nav().getByLabelText("Start with sample cards"));
  await userEvent.click(nav().getByRole("button", { name: "Create" }));
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("App auth", () => {
  it("shows the login form when not signed in", async () => {
    const { fetchMock } = fakeApi({ signedIn: false });
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByText("Product Launch")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/me"]);
  });

  it("shows the board when already signed in", async () => {
    fakeApi();
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Product Launch" })).toBeInTheDocument();
    expect(nav().getByText("user")).toBeInTheDocument();
  });

  it("signs in with valid credentials", async () => {
    const { fetchMock } = fakeApi({ signedIn: false });
    render(<App />);
    await screen.findByRole("heading", { name: "Sign in" });
    await signIn("user", "password");
    expect(await screen.findByRole("heading", { name: "Product Launch" })).toBeInTheDocument();
    const [, init] = fetchMock.mock.calls.find(([url]) => url === "/api/login")!;
    expect(init!.method).toBe("POST");
    expect(JSON.parse(init!.body as string)).toEqual({ username: "user", password: "password" });
  });

  it("shows an error for invalid credentials", async () => {
    fakeApi({ signedIn: false });
    render(<App />);
    await screen.findByRole("heading", { name: "Sign in" });
    await signIn("user", "wrong");
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid username or password");
    expect(screen.queryByText("Product Launch")).not.toBeInTheDocument();
  });

  it("creates an account and shows its board", async () => {
    const { fetchMock } = fakeApi({ signedIn: false });
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Create an account" }));
    expect(screen.getByRole("heading", { name: "Create account" })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Username"), "alice");
    await userEvent.type(screen.getByLabelText("Password"), "alice-password");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("heading", { name: "Product Launch" })).toBeInTheDocument();
    expect(nav().getByText("alice")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/register")).toBe(true);
  });

  it("explains why registration failed", async () => {
    fakeApi({ signedIn: false, overrides: { "POST /api/register": () => ({ status: 422 }) } });
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Create an account" }));
    await userEvent.type(screen.getByLabelText("Username"), "a b");
    await userEvent.type(screen.getByLabelText("Password"), "long-enough");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("at least 8 characters");
  });

  it("reports a taken username and switches back to sign in", async () => {
    fakeApi({ signedIn: false });
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Create an account" }));
    await userEvent.type(screen.getByLabelText("Username"), "user");
    await userEvent.type(screen.getByLabelText("Password"), "password");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already taken");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("logs out back to the login form", async () => {
    const { fetchMock } = fakeApi();
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Log out" }));
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/logout", { method: "POST" });
  });
});

describe("App boards", () => {
  it("loads the selected board from the API", async () => {
    const { state } = fakeApi();
    state.boards[0].board.columns[0].title = "From server";
    render(<App />);
    expect(await screen.findByDisplayValue("From server")).toBeInTheDocument();
  });

  it("lists boards with card counts", async () => {
    const { state } = fakeApi();
    state.boards.push({ id: 2, name: "Website", board: EMPTY, updatedAt: "t" });
    render(<App />);
    await screen.findByRole("heading", { name: "Product Launch" });
    expect(nav().getByRole("button", { name: /Product Launch\s*10/ })).toHaveAttribute("aria-current", "page");
    expect(nav().getByRole("button", { name: /Website\s*0/ })).not.toHaveAttribute("aria-current");
  });

  it("switches between boards and remembers the last one", async () => {
    const { state } = fakeApi();
    const website = structuredClone(EMPTY);
    website.columns[0].title = "Website backlog";
    state.boards.push({ id: 2, name: "Website", board: website, updatedAt: "t" });
    const { unmount } = render(<App />);
    await screen.findByRole("heading", { name: "Product Launch" });
    await userEvent.click(nav().getByRole("button", { name: /Website/ }));
    expect(await screen.findByRole("heading", { name: "Website" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Website backlog")).toBeInTheDocument();
    unmount();
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Website" })).toBeInTheDocument();
  });

  it("falls back to the first board when the remembered one is gone", async () => {
    localStorage.setItem("pm.lastBoardId", "42");
    fakeApi();
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Product Launch" })).toBeInTheDocument();
  });

  it("creates an empty board and opens it", async () => {
    const { state } = fakeApi();
    render(<App />);
    await screen.findByRole("heading", { name: "Product Launch" });
    await createBoard("Roadmap");
    expect(await screen.findByRole("heading", { name: "Roadmap" })).toBeInTheDocument();
    expect(screen.getByText("0 cards across 5 columns")).toBeInTheDocument();
    expect(state.boards.map((b) => b.name)).toEqual(["Product Launch", "Roadmap"]);
  });

  it("creates a board with sample cards", async () => {
    fakeApi();
    render(<App />);
    await screen.findByRole("heading", { name: "Product Launch" });
    await createBoard("Copy", true);
    expect(await screen.findByRole("heading", { name: "Copy" })).toBeInTheDocument();
    expect(screen.getByText("10 cards across 5 columns")).toBeInTheDocument();
  });

  it("renames the current board", async () => {
    const { state } = fakeApi();
    render(<App />);
    await screen.findByRole("heading", { name: "Product Launch" });
    await userEvent.click(screen.getByRole("button", { name: "Rename" }));
    await userEvent.clear(screen.getByLabelText("Board name"));
    await userEvent.type(screen.getByLabelText("Board name"), "Launch 2{Enter}");
    expect(await screen.findByRole("heading", { name: "Launch 2" })).toBeInTheDocument();
    expect(nav().getByRole("button", { name: /Launch 2/ })).toBeInTheDocument();
    expect(state.boards[0].name).toBe("Launch 2");
  });

  it("deletes the current board and opens the next one", async () => {
    const { state } = fakeApi();
    state.boards.push({ id: 2, name: "Website", board: EMPTY, updatedAt: "t" });
    render(<App />);
    await screen.findByRole("heading", { name: "Product Launch" });
    await userEvent.click(screen.getByRole("button", { name: "Delete board" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("heading", { name: "Website" })).toBeInTheDocument();
    expect(nav().queryByText("Product Launch")).not.toBeInTheDocument();
    expect(state.boards.map((b) => b.id)).toEqual([2]);
  });

  it("shows an empty state after deleting the last board", async () => {
    fakeApi();
    render(<App />);
    await screen.findByRole("heading", { name: "Product Launch" });
    await userEvent.click(screen.getByRole("button", { name: "Delete board" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("heading", { name: "No boards yet" })).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "AI assistant" })).not.toBeInTheDocument();
  });

  it("shows an error when a board action fails", async () => {
    fakeApi({ overrides: { "POST /api/boards": () => ({ status: 500 }) } });
    render(<App />);
    await screen.findByRole("heading", { name: "Product Launch" });
    await createBoard("Broken");
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
    expect(screen.getByRole("heading", { name: "Product Launch" })).toBeInTheDocument();
  });

  it("returns to the login form when a board action is rejected as signed out", async () => {
    fakeApi({ overrides: { "PATCH /api/boards/1": () => ({ status: 401 }) } });
    render(<App />);
    await screen.findByRole("heading", { name: "Product Launch" });
    await userEvent.click(screen.getByRole("button", { name: "Rename" }));
    await userEvent.type(screen.getByLabelText("Board name"), "x{Enter}");
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });
});

describe("App saving", () => {
  it("saves changes to the selected board", async () => {
    const { fetchMock, state } = fakeApi();
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Delete SSO integration" }));
    await waitFor(() => expect(puts(fetchMock)).toHaveLength(1));
    expect(puts(fetchMock)[0].url).toBe("/api/boards/1");
    expect(state.boards[0].board.cards.c9).toBeUndefined();
    expect(nav().getByRole("button", { name: /Product Launch\s*9/ })).toBeInTheDocument();
  });

  it("returns to the login form when a save is rejected as signed out", async () => {
    fakeApi({ overrides: { "PUT /api/boards/1": () => ({ status: 401 }) } });
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Delete SSO integration" }));
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("shows an error when a save fails", async () => {
    fakeApi({ overrides: { "PUT /api/boards/1": () => ({ status: 500 }) } });
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Delete SSO integration" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be saved");
  });

  it("shows an error when a save cannot reach the server", async () => {
    fakeApi({ overrides: { "PUT /api/boards/1": () => Promise.reject(new TypeError("offline")) } });
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Delete SSO integration" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be saved");
  });

  it("waits for each save to finish before sending the next", async () => {
    let release!: () => void;
    const firstSave = new Promise<void>((resolve) => (release = resolve));
    const bodies: Board[] = [];
    fakeApi({
      overrides: {
        "PUT /api/boards/1": async (init) => {
          bodies.push(JSON.parse(init!.body as string));
          if (bodies.length === 1) await firstSave;
          return { status: 200, body: {} };
        },
      },
    });
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Delete SSO integration" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete Brand refresh" }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 50));
    expect(bodies).toHaveLength(1);
    release();
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(Object.keys(bodies[0].cards)).toHaveLength(9);
    expect(Object.keys(bodies[1].cards)).toHaveLength(8);
  });

  it("loads a board only after pending saves finish", async () => {
    let release!: () => void;
    const save = new Promise<void>((resolve) => (release = resolve));
    const { state } = fakeApi({
      overrides: {
        "PUT /api/boards/1": async () => {
          await save;
          return { status: 200, body: {} };
        },
      },
    });
    state.boards.push({ id: 2, name: "Website", board: EMPTY, updatedAt: "t" });
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Delete SSO integration" }));
    await userEvent.click(nav().getByRole("button", { name: /Website/ }));
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole("heading", { name: "Website" })).not.toBeInTheDocument();
    release();
    expect(await screen.findByRole("heading", { name: "Website" })).toBeInTheDocument();
  });
});

describe("App chat", () => {
  it("returns to the login form when chat is rejected as signed out", async () => {
    fakeApi({ overrides: { "POST /api/boards/1/chat": () => ({ status: 401 }) } });
    render(<App />);
    await screen.findByText("Competitor research");
    await sendChat("hi");
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("locks the board and the board list while the AI is responding", async () => {
    let release!: () => void;
    const reply = new Promise<void>((resolve) => (release = resolve));
    fakeApi({
      overrides: {
        "POST /api/boards/1/chat": async () => {
          await reply;
          return { status: 200, body: { reply: "ok", board: null } };
        },
      },
    });
    render(<App />);
    const board = (await screen.findByRole("heading", { name: "Product Launch" })).closest("main")!;
    const boardList = screen.getByRole("navigation", { name: "Boards" });
    expect(board).not.toHaveAttribute("inert");
    await sendChat("hi");
    await waitFor(() => expect(board).toHaveAttribute("inert"));
    expect(boardList).toHaveAttribute("inert");
    release();
    await screen.findByText("ok");
    expect(board).not.toHaveAttribute("inert");
    expect(boardList).not.toHaveAttribute("inert");
  });

  it("applies an AI board update to the board without re-saving it", async () => {
    const board = structuredClone(initialBoard);
    board.cards.c1.title = "Added by AI";
    const { fetchMock } = fakeApi({
      overrides: { "POST /api/boards/1/chat": () => ({ status: 200, body: { reply: "Updated c1", board } }) },
    });
    render(<App />);
    await screen.findByText("Competitor research");
    await sendChat("Rename c1");
    expect(await screen.findByText("Added by AI")).toBeInTheDocument();
    expect(screen.queryByText("Competitor research")).not.toBeInTheDocument();
    expect(puts(fetchMock)).toHaveLength(0);
  });

  it("sends chat only after a pending board save completes", async () => {
    let release!: () => void;
    const save = new Promise<void>((resolve) => (release = resolve));
    const order: string[] = [];
    fakeApi({
      overrides: {
        "PUT /api/boards/1": async () => {
          await save;
          order.push("put done");
          return { status: 200, body: {} };
        },
        "POST /api/boards/1/chat": () => {
          order.push("chat");
          return { status: 200, body: { reply: "ok", board: null } };
        },
      },
    });
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Delete SSO integration" }));
    await sendChat("What changed?");
    await new Promise((r) => setTimeout(r, 30));
    expect(order).toEqual([]);
    release();
    await screen.findByText("ok");
    expect(order).toEqual(["put done", "chat"]);
  });

  it("starts a fresh conversation for each board", async () => {
    const { state } = fakeApi();
    state.boards.push({ id: 2, name: "Website", board: EMPTY, updatedAt: "t" });
    render(<App />);
    await screen.findByRole("heading", { name: "Product Launch" });
    await sendChat("First board question");
    await screen.findByText("ok");
    await userEvent.click(nav().getByRole("button", { name: /Website/ }));
    await screen.findByRole("heading", { name: "Website" });
    expect(screen.queryByText("First board question")).not.toBeInTheDocument();
  });
});

describe("App account", () => {
  it("opens account settings and returns to a board", async () => {
    fakeApi();
    render(<App />);
    await screen.findByRole("heading", { name: "Product Launch" });
    await userEvent.click(nav().getByRole("button", { name: "Account" }));
    expect(screen.getByRole("heading", { name: "Change password" })).toBeInTheDocument();
    expect(nav().getByRole("button", { name: "Account" })).toHaveAttribute("aria-current", "page");
    await userEvent.click(nav().getByRole("button", { name: /Product Launch/ }));
    expect(await screen.findByRole("heading", { name: "Product Launch" })).toBeInTheDocument();
  });

  it("signs out after deleting the account", async () => {
    fakeApi({ overrides: { "DELETE /api/account": () => ({ status: 204 }) } });
    render(<App />);
    await screen.findByRole("heading", { name: "Product Launch" });
    await userEvent.click(nav().getByRole("button", { name: "Account" }));
    await userEvent.type(screen.getByLabelText("Confirm with your password"), "password");
    await userEvent.click(screen.getByRole("button", { name: "Delete account" }));
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });
});
