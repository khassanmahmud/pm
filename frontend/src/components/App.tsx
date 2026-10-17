"use client";

import { useEffect, useRef, useState } from "react";
import type { Board } from "@/lib/board";
import { ChatSidebar } from "./ChatSidebar";
import { KanbanBoard } from "./KanbanBoard";
import { LoginForm } from "./LoginForm";

const SAVE_ERROR = "A change could not be saved. Reload to see the saved board.";

export function App() {
  const [user, setUser] = useState<string | null>();
  const [board, setBoard] = useState<Board | null>(null);
  const saving = useRef(Promise.resolve());
  const [saveError, setSaveError] = useState("");
  const [aiBusy, setAiBusy] = useState(false);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setUser(data?.username ?? null));
  }, []);

  useEffect(() => {
    if (!user) return;
    fetch("/api/board")
      .then((r) => r.json())
      .then(setBoard);
  }, [user]);

  function updateBoard(next: Board, persist = true) {
    setBoard(next);
    if (!persist) return;
    // Queue saves so they reach the server in order.
    saving.current = saving.current
      .then(() =>
        fetch("/api/board", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        }),
      )
      .then(
        (r) => {
          if (r.status === 401) signOut();
          else if (!r.ok) setSaveError(SAVE_ERROR);
        },
        () => setSaveError(SAVE_ERROR),
      );
  }

  function signOut() {
    setUser(null);
    setBoard(null);
    setSaveError("");
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    signOut();
  }

  if (user === undefined) return null;
  if (user === null) return <LoginForm onLogin={setUser} />;
  if (!board) return null;
  return (
    <div className="flex flex-1">
      {saveError && (
        <p role="alert" className="fixed left-1/2 top-4 z-10 -translate-x-1/2 rounded-md bg-red-600 px-4 py-2 text-sm text-white shadow-lg">
          {saveError}
        </p>
      )}
      {/* Locked while the AI works, so its board update cannot overwrite edits made meanwhile. */}
      <KanbanBoard board={board} onChange={updateBoard} onLogout={logout} locked={aiBusy} />
      {/* The backend already saved AI board updates, so only update local state. */}
      <ChatSidebar
        onBoardUpdate={(next) => updateBoard(next, false)}
        beforeSend={() => saving.current}
        onBusyChange={setAiBusy}
        onUnauthorized={signOut}
      />
    </div>
  );
}
