"use client";

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Card, Column } from "@/lib/board";
import { KanbanCard } from "./KanbanCard";

type Props = {
  column: Column;
  cards: Card[];
  onRename: (title: string) => void;
  onRenameDone: () => void;
  onAdd: (title: string, details: string) => void;
  onEdit: (cardId: string, title: string, details: string) => void;
  onDelete: (cardId: string) => void;
};

export function KanbanColumn({ column, cards, onRename, onRenameDone, onAdd, onEdit, onDelete }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onAdd(title.trim(), details.trim());
    setTitle("");
    setDetails("");
    setAdding(false);
  }

  return (
    <section
      ref={setNodeRef}
      data-testid={`column-${column.id}`}
      className={`flex min-w-72 flex-1 flex-col rounded-2xl border bg-white/60 backdrop-blur transition-colors ${
        isOver ? "border-primary/50 bg-primary/5" : "border-slate-200/70"
      }`}
    >
      <header className="flex items-center gap-2 border-b border-slate-200/70 px-4 pb-3 pt-4">
        <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />
        <input
          value={column.title}
          onChange={(e) => onRename(e.target.value)}
          onBlur={onRenameDone}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          aria-label="Column title"
          className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-0.5 text-sm font-semibold uppercase tracking-wide text-navy outline-none transition hover:bg-slate-100 focus:bg-white focus:ring-2 focus:ring-primary/40"
        />
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          {cards.length}
        </span>
      </header>

      <SortableContext items={column.cardIds} strategy={verticalListSortingStrategy}>
        <ul className="flex min-h-24 flex-1 flex-col gap-3 p-3">
          {cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              onEdit={(title, details) => onEdit(card.id, title, details)}
              onDelete={() => onDelete(card.id)}
            />
          ))}
        </ul>
      </SortableContext>

      <div className="p-3 pt-0">
        {adding ? (
          <form onSubmit={submit} className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <input
              autoFocus
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Card title"
              aria-label="Card title"
              className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm text-navy outline-none placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Details"
              aria-label="Card details"
              rows={3}
              className="w-full resize-none rounded-md border border-slate-200 px-2.5 py-1.5 text-sm text-navy outline-none placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="rounded-md px-3 py-1.5 text-sm text-muted transition hover:bg-slate-100 hover:text-navy"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-md bg-secondary px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-secondary/90"
              >
                Add card
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex w-full items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-white hover:text-primary"
          >
            <span aria-hidden className="text-base leading-none">+</span> Add a card
          </button>
        )}
      </div>
    </section>
  );
}
