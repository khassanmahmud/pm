"use client";

import { useState } from "react";
import type { BoardSummary } from "@/lib/board";
import { cancelButton, inlineInput, outlineButton, submitButton } from "./ui";

type Props = {
  username: string;
  boards: BoardSummary[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onCreate: (name: string, sample: boolean) => void;
  onAccount: () => void;
  onLogout: () => void;
  accountOpen: boolean;
  locked?: boolean;
};

export function BoardNav({ username, boards, selectedId, onSelect, onCreate, onAccount, onLogout, accountOpen, locked }: Props) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [sample, setSample] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onCreate(name.trim(), sample);
    setName("");
    setSample(false);
    setCreating(false);
  }

  return (
    <nav
      aria-label="Boards"
      inert={locked}
      className={`sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-slate-200/70 bg-white/80 backdrop-blur transition-opacity ${
        locked ? "opacity-60" : ""
      }`}
    >
      <div className="px-5 py-5">
        <p className="text-lg font-bold tracking-tight text-navy">Kanban Studio</p>
        <div className="mt-2 h-1 w-10 rounded-full bg-accent" />
      </div>

      <div className="flex-1 overflow-y-auto px-3">
        <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted">Boards</p>
        <ul className="space-y-1">
          {boards.map((b) => {
            const current = b.id === selectedId && !accountOpen;
            return (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => onSelect(b.id)}
                  aria-current={current ? "page" : undefined}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                    current ? "bg-primary/10 font-semibold text-primary" : "text-navy hover:bg-slate-100"
                  }`}
                >
                  <span className="truncate">{b.name}</span>
                  <span className="shrink-0 text-xs text-muted">{b.cardCount}</span>
                </button>
              </li>
            );
          })}
        </ul>

        {creating ? (
          <form onSubmit={submit} className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <input
              autoFocus
              required
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Board name"
              aria-label="Board name"
              className={inlineInput}
            />
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={sample} onChange={(e) => setSample(e.target.checked)} />
              Start with sample cards
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreating(false)}
                className={cancelButton}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={submitButton}
              >
                Create
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="mt-2 flex w-full items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-slate-100 hover:text-primary"
          >
            <span aria-hidden className="text-base leading-none">+</span> New board
          </button>
        )}
      </div>

      <div className="border-t border-slate-200/70 p-3">
        <p className="truncate px-2 pb-2 text-sm font-medium text-navy" title={username}>
          {username}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onAccount}
            aria-current={accountOpen ? "page" : undefined}
            className={`flex-1 ${outlineButton}`}
          >
            Account
          </button>
          <button
            type="button"
            onClick={onLogout}
            className={`flex-1 ${outlineButton}`}
          >
            Log out
          </button>
        </div>
      </div>
    </nav>
  );
}
