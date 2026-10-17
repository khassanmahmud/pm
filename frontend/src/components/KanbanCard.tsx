"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Card } from "@/lib/board";

type ViewProps = { card: Card; onEdit?: () => void; onDelete?: () => void; overlay?: boolean };

const iconButton =
  "rounded-md p-1.5 text-muted opacity-0 transition focus-visible:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100";

export function CardView({ card, onEdit, onDelete, overlay }: ViewProps) {
  return (
    <div
      className={`group relative rounded-xl border border-slate-200/80 bg-white p-4 pr-16 shadow-sm transition-shadow hover:shadow-md ${
        overlay ? "rotate-2 cursor-grabbing shadow-xl ring-2 ring-primary/40" : "cursor-grab"
      }`}
    >
      <span className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-accent" />
      <h3 className="text-sm font-semibold text-navy">{card.title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-muted">{card.details}</p>
      <div className="absolute right-2 top-2 flex">
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${card.title}`}
            className={`${iconButton} hover:bg-primary/10 hover:text-primary`}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
              <path d="M13.59 3.59a2 2 0 0 1 2.82 2.82l-8.5 8.5a1 1 0 0 1-.46.26l-3 .75a.5.5 0 0 1-.6-.6l.75-3a1 1 0 0 1 .26-.46l8.73-8.27Z" />
            </svg>
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete ${card.title}`}
            className={`${iconButton} hover:bg-red-50 hover:text-red-600`}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

type EditProps = { card: Card; onSave: (title: string, details: string) => void; onCancel: () => void };

function CardEditor({ card, onSave, onCancel }: EditProps) {
  const [title, setTitle] = useState(card.title);
  const [details, setDetails] = useState(card.details);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSave(title.trim(), details.trim());
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-xl border border-primary/40 bg-white p-3 shadow-sm">
      <input
        autoFocus
        required
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        aria-label="Edit card title"
        className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm text-navy outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
      <textarea
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        aria-label="Edit card details"
        rows={3}
        className="w-full resize-none rounded-md border border-slate-200 px-2.5 py-1.5 text-sm text-navy outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-sm text-muted transition hover:bg-slate-100 hover:text-navy"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="rounded-md bg-secondary px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-secondary/90"
        >
          Save
        </button>
      </div>
    </form>
  );
}

type Props = { card: Card; onEdit: (title: string, details: string) => void; onDelete: () => void };

export function KanbanCard({ card, onEdit, onDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id, disabled: editing });

  return (
    <li
      ref={(node) => {
        setNodeRef(node);
        setActivatorNodeRef(node);
      }}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={isDragging ? "opacity-40" : ""}
      data-testid={`card-${card.id}`}
      {...(editing ? {} : { ...attributes, ...listeners })}
    >
      {editing ? (
        <CardEditor
          card={card}
          onSave={(title, details) => {
            onEdit(title, details);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <CardView card={card} onEdit={() => setEditing(true)} onDelete={onDelete} />
      )}
    </li>
  );
}
