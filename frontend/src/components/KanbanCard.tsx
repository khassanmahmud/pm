"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { formatDueDate, parseLabels, PRIORITIES, type Card, type CardFields, type Priority } from "@/lib/board";
import { cancelButton, CloseIcon, inlineInput, priorityName, submitButton } from "./ui";

type ViewProps = { card: Card; overdue?: boolean; onEdit?: () => void; onDelete?: () => void; overlay?: boolean };

const iconButton =
  "rounded-md p-1.5 text-muted opacity-0 transition focus-visible:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100";

const priorityStyle: Record<Priority, string> = {
  high: "bg-red-50 text-red-700 ring-red-200",
  medium: "bg-accent/15 text-amber-800 ring-accent/40",
  low: "bg-slate-100 text-slate-600 ring-slate-200",
};

export function CardView({ card, overdue, onEdit, onDelete, overlay }: ViewProps) {
  const hasMeta = card.priority || card.dueDate || card.labels.length > 0;
  return (
    <div
      className={`group relative rounded-xl border border-slate-200/80 bg-white p-4 pr-16 shadow-sm transition-shadow hover:shadow-md ${
        overlay ? "rotate-2 cursor-grabbing shadow-xl ring-2 ring-primary/40" : "cursor-grab"
      }`}
    >
      <span className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-accent" />
      <h3 className="text-sm font-semibold text-navy">{card.title}</h3>
      {card.details && <p className="mt-1 text-sm leading-relaxed text-muted">{card.details}</p>}
      {hasMeta && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
          {card.priority && (
            <span className={`rounded-full px-2 py-0.5 font-medium capitalize ring-1 ring-inset ${priorityStyle[card.priority]}`}>
              {card.priority}
            </span>
          )}
          {card.dueDate && (
            <span
              data-overdue={overdue || undefined}
              className={`rounded-full px-2 py-0.5 font-medium ring-1 ring-inset ${
                overdue ? "bg-red-600 text-white ring-red-600" : "bg-white text-navy ring-slate-200"
              }`}
            >
              {overdue ? "Overdue" : "Due"} {formatDueDate(card.dueDate)}
            </span>
          )}
          {card.labels.map((label) => (
            <span key={label} className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
              {label}
            </span>
          ))}
        </div>
      )}
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
            <CloseIcon />
          </button>
        )}
      </div>
    </div>
  );
}

type EditProps = { card: Card; onSave: (fields: CardFields) => void; onCancel: () => void };

function CardEditor({ card, onSave, onCancel }: EditProps) {
  const [title, setTitle] = useState(card.title);
  const [details, setDetails] = useState(card.details);
  const [priority, setPriority] = useState<Priority | "">(card.priority ?? "");
  const [dueDate, setDueDate] = useState(card.dueDate ?? "");
  const [labels, setLabels] = useState(card.labels.join(", "));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      title: title.trim(),
      details: details.trim(),
      priority: priority || null,
      dueDate: dueDate || null,
      labels: parseLabels(labels),
    });
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-xl border border-primary/40 bg-white p-3 shadow-sm">
      <input
        autoFocus
        required
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        aria-label="Edit card title"
        className={inlineInput}
      />
      <textarea
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        aria-label="Edit card details"
        rows={3}
        className={`${inlineInput} resize-none`}
      />
      <div className="flex gap-2">
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority | "")}
          aria-label="Priority"
          className={inlineInput}
        >
          <option value="">No priority</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {priorityName(p)}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          aria-label="Due date"
          className={inlineInput}
        />
      </div>
      <input
        value={labels}
        onChange={(e) => setLabels(e.target.value)}
        placeholder="Labels, comma separated"
        aria-label="Labels"
        className={inlineInput}
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className={cancelButton}
        >
          Cancel
        </button>
        <button
          type="submit"
          className={submitButton}
        >
          Save
        </button>
      </div>
    </form>
  );
}

type Props = { card: Card; overdue: boolean; onEdit: (fields: CardFields) => void; onDelete: () => void };

export function KanbanCard({ card, overdue, onEdit, onDelete }: Props) {
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
          onSave={(fields) => {
            onEdit(fields);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <CardView card={card} overdue={overdue} onEdit={() => setEditing(true)} onDelete={onDelete} />
      )}
    </li>
  );
}
