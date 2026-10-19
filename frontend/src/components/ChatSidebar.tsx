"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Board } from "@/lib/board";

type Message = { role: "user" | "assistant"; content: string };

type Props = {
  boardId: number;
  onBoardUpdate: (board: Board) => void;
  beforeSend: () => Promise<void>;
  onBusyChange?: (busy: boolean) => void;
  onUnauthorized?: () => void;
};

export function ChatSidebar({ boardId, onBoardUpdate, beforeSend, onBusyChange, onUnauthorized }: Props) {
  const [open, setOpen] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [messages, loading]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const message = input.trim();
    if (!message || loading) return;
    const history = messages;
    setMessages([...history, { role: "user", content: message }]);
    setInput("");
    setError("");
    setLoading(true);
    onBusyChange?.(true);
    // Make sure the server has the latest board before the AI reads it.
    await beforeSend();
    const response = await api(`/api/boards/${boardId}/chat`, "POST", { message, history }).catch(() => null);
    setLoading(false);
    onBusyChange?.(false);
    if (response?.status === 401) return onUnauthorized?.();
    if (!response?.ok) {
      setError("The assistant could not respond. Please try again.");
      return;
    }
    const data: { reply: string; board: Board | null } = await response.json();
    setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
    if (data.board) onBoardUpdate(data.board);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 rounded-full bg-secondary px-5 py-3 text-sm font-medium text-white shadow-lg transition hover:bg-secondary/90"
      >
        AI assistant
      </button>
    );
  }

  return (
    <aside
      aria-label="AI assistant"
      className="sticky top-0 flex h-screen w-80 shrink-0 flex-col border-l border-slate-200/70 bg-white/80 backdrop-blur"
    >
      <header className="flex items-start justify-between border-b border-slate-200/70 px-5 py-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-navy">AI assistant</h2>
          <div className="mt-2 h-1 w-10 rounded-full bg-accent" />
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close assistant"
          className="rounded-md p-1.5 text-muted transition hover:bg-slate-100 hover:text-navy"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        </button>
      </header>

      <div ref={list} className="flex flex-1 flex-col gap-3 overflow-y-auto px-5 py-4" data-testid="chat-messages">
        {messages.length === 0 && (
          <p className="text-sm text-muted">
            Ask about this board, or ask me to add, edit, move or prioritize cards.
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            data-role={m.role}
            className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
              m.role === "user"
                ? "self-end rounded-br-sm bg-primary text-white"
                : "self-start rounded-bl-sm border border-slate-200 bg-white text-navy shadow-sm"
            }`}
          >
            {m.content}
          </div>
        ))}
        {loading && (
          <div role="status" className="flex items-center gap-1.5 self-start rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <span className="sr-only">Thinking</span>
            {[0, 150, 300].map((delay) => (
              <span
                key={delay}
                className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent"
                style={{ animationDelay: `${delay}ms` }}
              />
            ))}
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      <form onSubmit={send} className="flex gap-2 border-t border-slate-200/70 p-4">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          rows={2}
          placeholder="Message the assistant"
          aria-label="Message"
          className="flex-1 resize-none rounded-md border border-slate-200 px-3 py-2 text-sm text-navy outline-none placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="self-end rounded-md bg-secondary px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-secondary/90 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </aside>
  );
}
