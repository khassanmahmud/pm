"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Board, BoardSummary } from "@/lib/board";
import { AccountSettings } from "./AccountSettings";
import { BoardNav } from "./BoardNav";
import { ChatSidebar } from "./ChatSidebar";
import { KanbanBoard } from "./KanbanBoard";
import { LoginForm } from "./LoginForm";

const SAVE_ERROR = "A change could not be saved. Reload to see the saved board.";
const ACTION_ERROR = "Something went wrong. Please try again.";
const LAST_BOARD = "pm.lastBoardId";

export function App() {
  const [user, setUser] = useState<string | null>();
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [boardId, setBoardId] = useState<number | null>(null);
  // Keyed by id so a board from a previous selection is never shown or saved under the new one.
  const [loaded, setLoaded] = useState<{ id: number; board: Board } | null>(null);
  const [view, setView] = useState<"board" | "account">("board");
  const saving = useRef(Promise.resolve());
  const [error, setError] = useState("");
  const [aiBusy, setAiBusy] = useState(false);

  useEffect(() => {
    api("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setUser(data?.username ?? null));
  }, []);

  useEffect(() => {
    if (!user) return;
    api("/api/boards")
      .then((r) => r.json())
      .then((list: BoardSummary[]) => {
        setBoards(list);
        const last = Number(localStorage.getItem(LAST_BOARD));
        setBoardId(list.find((b) => b.id === last)?.id ?? list[0]?.id ?? null);
      });
  }, [user]);

  useEffect(() => {
    if (boardId === null) return;
    let current = true;
    // Load after pending saves, so switching back to a board shows its latest state.
    saving.current
      .then(() => api(`/api/boards/${boardId}`))
      .then((r) => r.json())
      .then((board: Board) => current && setLoaded({ id: boardId, board }));
    return () => {
      current = false;
    };
  }, [boardId]);

  function select(id: number | null) {
    setView("board");
    setBoardId(id);
    if (id !== null) localStorage.setItem(LAST_BOARD, String(id));
  }

  /** Returns the response if it succeeded; handles sign-out and errors otherwise. */
  function check(response: Response): Response | null {
    if (response.status === 401) signOut();
    else if (!response.ok) setError(ACTION_ERROR);
    else return response;
    return null;
  }

  function updateBoard(next: Board, persist = true) {
    if (boardId === null) return;
    const id = boardId;
    setLoaded({ id, board: next });
    setBoards((list) => list && list.map((b) => (b.id === id ? { ...b, cardCount: Object.keys(next.cards).length } : b)));
    if (!persist) return;
    // Queue saves so they reach the server in order.
    saving.current = saving.current
      .then(() => api(`/api/boards/${id}`, "PUT", next))
      .then(
        (r) => {
          if (r.status === 401) signOut();
          else if (!r.ok) setError(SAVE_ERROR);
        },
        () => setError(SAVE_ERROR),
      );
  }

  async function createBoard(name: string, sample: boolean) {
    const response = check(await api("/api/boards", "POST", { name, sample }));
    if (!response) return;
    const created: BoardSummary = await response.json();
    setBoards((list) => [...(list ?? []), created]);
    select(created.id);
  }

  async function renameBoard(name: string) {
    const response = check(await api(`/api/boards/${boardId}`, "PATCH", { name }));
    if (!response) return;
    const renamed: BoardSummary = await response.json();
    setBoards((list) => list && list.map((b) => (b.id === renamed.id ? renamed : b)));
  }

  async function deleteBoard() {
    const id = boardId;
    await saving.current;
    if (!check(await api(`/api/boards/${id}`, "DELETE"))) return;
    const remaining = boards!.filter((b) => b.id !== id);
    setBoards(remaining);
    setLoaded(null);
    select(remaining[0]?.id ?? null);
  }

  function signOut() {
    setUser(null);
    setBoards(null);
    setBoardId(null);
    setLoaded(null);
    setView("board");
    setError("");
  }

  async function logout() {
    await api("/api/logout", "POST");
    signOut();
  }

  if (user === undefined) return null;
  if (user === null) return <LoginForm onLogin={setUser} />;
  if (!boards) return null;

  const summary = boards.find((b) => b.id === boardId);
  const board = loaded && loaded.id === boardId ? loaded.board : null;

  return (
    <div className="flex flex-1">
      {error && (
        <p role="alert" className="fixed left-1/2 top-4 z-10 -translate-x-1/2 rounded-md bg-red-600 px-4 py-2 text-sm text-white shadow-lg">
          {error}
        </p>
      )}
      {/* Locked while the AI works, so the reply cannot land on a different board. */}
      <BoardNav
        username={user}
        boards={boards}
        selectedId={boardId}
        onSelect={select}
        onCreate={createBoard}
        onAccount={() => setView("account")}
        onLogout={logout}
        accountOpen={view === "account"}
        locked={aiBusy}
      />
      {view === "account" ? (
        <AccountSettings username={user} onDeleted={signOut} onUnauthorized={signOut} />
      ) : summary && board ? (
        <>
          {/* Locked while the AI works, so its board update cannot overwrite edits made meanwhile. */}
          <KanbanBoard
            name={summary.name}
            board={board}
            onChange={updateBoard}
            onRename={renameBoard}
            onDelete={deleteBoard}
            locked={aiBusy}
          />
          {/* The backend already saved AI board updates, so only update local state. */}
          <ChatSidebar
            key={summary.id}
            boardId={summary.id}
            onBoardUpdate={(next) => updateBoard(next, false)}
            beforeSend={() => saving.current}
            onBusyChange={setAiBusy}
            onUnauthorized={signOut}
          />
        </>
      ) : boards.length === 0 ? (
        <main className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-navy">No boards yet</h1>
          <p className="text-sm text-muted">Create a board from the sidebar to get started.</p>
        </main>
      ) : null}
    </div>
  );
}
