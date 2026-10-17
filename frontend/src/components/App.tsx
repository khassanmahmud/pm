"use client";

import { useEffect, useRef, useState } from "react";
import type { Board } from "@/lib/board";
import { ChatSidebar } from "./ChatSidebar";
import { KanbanBoard } from "./KanbanBoard";
import { LoginForm } from "./LoginForm";

export function App() {
  const [user, setUser] = useState<string | null>();
  const [board, setBoard] = useState<Board | null>(null);
  const saving = useRef(Promise.resolve());

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
      .then(() => undefined, console.error);
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    setUser(null);
    setBoard(null);
  }

  if (user === undefined) return null;
  if (user === null) return <LoginForm onLogin={setUser} />;
  if (!board) return null;
  return (
    <div className="flex flex-1">
      <KanbanBoard board={board} onChange={updateBoard} onLogout={logout} />
      {/* The backend already saved AI board updates, so only update local state. */}
      <ChatSidebar onBoardUpdate={(next) => updateBoard(next, false)} beforeSend={() => saving.current} />
    </div>
  );
}
