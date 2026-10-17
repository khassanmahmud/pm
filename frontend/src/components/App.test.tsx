import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { initialBoard } from "@/test/sampleBoard";
import { App } from "./App";

type Route = (init?: RequestInit) => { status: number; body?: unknown };

const boardRoute: Route = (init) =>
  init?.method === "PUT" ? { status: 200, body: JSON.parse(init.body as string) } : { status: 200, body: initialBoard };

function mockApi(routes: Record<string, Route>) {
  const all: Record<string, Route> = { "/api/board": boardRoute, ...routes };
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const { status, body } = all[url](init);
    return new Response(JSON.stringify(body ?? {}), { status });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const signedOut = () => ({ status: 401 });
const signedIn = () => ({ status: 200, body: { username: "user" } });

const puts = (fetchMock: ReturnType<typeof mockApi>) =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT").map(([, init]) => JSON.parse(init!.body as string));

async function signIn(username: string, password: string) {
  await userEvent.type(screen.getByLabelText("Username"), username);
  await userEvent.type(screen.getByLabelText("Password"), password);
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("App", () => {
  it("shows the login form when not signed in", async () => {
    mockApi({ "/api/me": signedOut });
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByText("Product Launch")).not.toBeInTheDocument();
  });

  it("shows the board when already signed in", async () => {
    mockApi({ "/api/me": signedIn });
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Product Launch" })).toBeInTheDocument();
  });

  it("signs in with valid credentials", async () => {
    const fetchMock = mockApi({
      "/api/me": signedOut,
      "/api/login": () => ({ status: 200, body: { username: "user" } }),
    });
    render(<App />);
    await screen.findByRole("heading", { name: "Sign in" });
    await signIn("user", "password");
    expect(await screen.findByRole("heading", { name: "Product Launch" })).toBeInTheDocument();
    const [, init] = fetchMock.mock.calls.find(([url]) => url === "/api/login")!;
    expect(init!.method).toBe("POST");
    expect(JSON.parse(init!.body as string)).toEqual({ username: "user", password: "password" });
  });

  it("shows an error for invalid credentials", async () => {
    mockApi({ "/api/me": signedOut, "/api/login": () => ({ status: 401 }) });
    render(<App />);
    await screen.findByRole("heading", { name: "Sign in" });
    await signIn("user", "wrong");
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid username or password");
    expect(screen.queryByText("Product Launch")).not.toBeInTheDocument();
  });

  it("logs out back to the login form", async () => {
    const fetchMock = mockApi({ "/api/me": signedIn, "/api/logout": () => ({ status: 200 }) });
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Log out" }));
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/logout", { method: "POST" });
  });

  it("loads the board from the API after sign in", async () => {
    const board = structuredClone(initialBoard);
    board.columns[0].title = "From server";
    mockApi({ "/api/me": signedIn, "/api/board": () => ({ status: 200, body: board }) });
    render(<App />);
    expect(await screen.findByDisplayValue("From server")).toBeInTheDocument();
  });

  it("saves changes to the API", async () => {
    const fetchMock = mockApi({ "/api/me": signedIn });
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Delete SSO integration" }));
    await waitFor(() => expect(puts(fetchMock)).toHaveLength(1));
    expect(puts(fetchMock)[0].cards.c9).toBeUndefined();
  });

  it("waits for each save to finish before sending the next", async () => {
    let release!: () => void;
    const firstSave = new Promise<void>((resolve) => (release = resolve));
    const putBodies: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/api/me") return Response.json({ username: "user" });
        if (init?.method === "PUT") {
          putBodies.push(init.body as string);
          if (putBodies.length === 1) await firstSave;
        }
        return Response.json(initialBoard);
      }),
    );
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Delete SSO integration" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete Brand refresh" }));
    await waitFor(() => expect(putBodies).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 50));
    expect(putBodies).toHaveLength(1);
    release();
    await waitFor(() => expect(putBodies).toHaveLength(2));
    expect(Object.keys(JSON.parse(putBodies[0]).cards)).toHaveLength(9);
    expect(Object.keys(JSON.parse(putBodies[1]).cards)).toHaveLength(8);
  });

  it("does not load the board when signed out", async () => {
    const fetchMock = mockApi({ "/api/me": signedOut });
    render(<App />);
    await screen.findByRole("heading", { name: "Sign in" });
    expect(fetchMock.mock.calls.map(([url]) => url)).not.toContain("/api/board");
  });

  it("applies an AI board update to the board without re-saving it", async () => {
    const board = structuredClone(initialBoard);
    board.cards.c1.title = "Added by AI";
    const fetchMock = mockApi({
      "/api/me": signedIn,
      "/api/chat": () => ({ status: 200, body: { reply: "Updated c1", board } }),
    });
    render(<App />);
    await screen.findByText("Competitor research");
    await userEvent.type(screen.getByLabelText("Message"), "Rename c1");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Added by AI")).toBeInTheDocument();
    expect(screen.queryByText("Competitor research")).not.toBeInTheDocument();
    expect(puts(fetchMock)).toHaveLength(0);
  });

  it("sends chat only after a pending board save completes", async () => {
    let release!: () => void;
    const save = new Promise<void>((resolve) => (release = resolve));
    const order: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/api/me") return Response.json({ username: "user" });
        if (init?.method === "PUT") {
          await save;
          order.push("put done");
        }
        if (url === "/api/chat") {
          order.push("chat");
          return Response.json({ reply: "ok", board: null });
        }
        return Response.json(initialBoard);
      }),
    );
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Delete SSO integration" }));
    await userEvent.type(screen.getByLabelText("Message"), "What changed?");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    await new Promise((r) => setTimeout(r, 30));
    expect(order).toEqual([]);
    release();
    await screen.findByText("ok");
    expect(order).toEqual(["put done", "chat"]);
  });
});
