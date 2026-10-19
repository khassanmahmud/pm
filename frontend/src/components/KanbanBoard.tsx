"use client";

import { useMemo, useState } from "react";
import {
  closestCorners,
  pointerWithin,
  type CollisionDetection,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import {
  addCard,
  deleteCard,
  DONE_COLUMN,
  findColumnId,
  matchesFilter,
  moveCard,
  newCard,
  overdueCardIds,
  PRIORITIES,
  renameColumn,
  updateCard,
  type Board,
  type Filter,
  type Priority,
} from "@/lib/board";
import { KanbanColumn } from "./KanbanColumn";
import { CardView } from "./KanbanCard";

// Prefer what is under the pointer; closestCorners alone picks nearby cards over tall empty columns.
const collisionDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : closestCorners(args);
};

type Props = {
  name: string;
  board: Board;
  onChange: (board: Board, persist?: boolean) => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  locked?: boolean;
};

const button =
  "rounded-md border border-slate-200 px-3 py-1.5 text-sm text-muted transition hover:border-primary hover:text-primary";
const input =
  "rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-navy outline-none placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/20";

export function KanbanBoard({ name, board, onChange, onRename, onDelete, locked = false }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>({ query: "", priority: "" });
  const [renaming, setRenaming] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const overdue = useMemo(() => new Set(overdueCardIds(board)), [board]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function targetIndex(overId: string, columnId: string) {
    const cardIds = board.columns.find((c) => c.id === columnId)!.cardIds;
    const index = cardIds.indexOf(overId);
    return index === -1 ? cardIds.length : index;
  }

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(String(active.id));
  }

  function handleDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const from = findColumnId(board, String(active.id));
    const to = findColumnId(board, String(over.id));
    if (!from || !to || from === to) return;
    // Live preview while dragging; saved on drag end.
    onChange(moveCard(board, String(active.id), to, targetIndex(String(over.id), to)), false);
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    const to = over && findColumnId(board, String(over.id));
    if (!to || active.id === over.id) return onChange(board);
    onChange(moveCard(board, String(active.id), to, targetIndex(String(over.id), to)));
  }

  function handleDragCancel() {
    setActiveId(null);
    onChange(board);
  }

  const totalCards = Object.keys(board.cards).length;
  const doneCards = board.columns.find((c) => c.id === DONE_COLUMN)!.cardIds.length;
  const filtering = filter.query.trim() !== "" || filter.priority !== "";

  function submitRename(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const next = new FormData(e.currentTarget).get("name")!.toString().trim();
    if (next && next !== name) onRename(next);
    setRenaming(false);
  }

  return (
    <main
      inert={locked}
      className={`mx-auto flex w-full min-w-0 max-w-[1600px] flex-1 flex-col px-6 py-6 transition-opacity ${locked ? "opacity-60" : ""}`}
    >
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Project board</p>
          {renaming ? (
            <form onSubmit={submitRename} className="mt-1 flex gap-2">
              <input
                name="name"
                autoFocus
                required
                maxLength={80}
                defaultValue={name}
                aria-label="Board name"
                className={`${input} text-lg font-bold`}
              />
              <button type="submit" className="rounded-md bg-secondary px-3 py-1.5 text-sm font-medium text-white">
                Save
              </button>
              <button type="button" onClick={() => setRenaming(false)} className={button}>
                Cancel
              </button>
            </form>
          ) : (
            <h1 className="mt-1 truncate text-3xl font-bold tracking-tight text-navy">{name}</h1>
          )}
          <div className="mt-3 h-1 w-16 rounded-full bg-accent" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted">
            <span>
              {totalCards} cards across {board.columns.length} columns
            </span>
            {totalCards > 0 && <> &middot; {Math.round((doneCards / totalCards) * 100)}% done</>}
            {overdue.size > 0 && <span className="font-medium text-red-600"> &middot; {overdue.size} overdue</span>}
          </p>
          {!renaming && (
            <button type="button" onClick={() => setRenaming(true)} className={button}>
              Rename
            </button>
          )}
          {confirmingDelete ? (
            <span className="flex items-center gap-2 text-sm text-navy">
              Delete this board?
              <button
                type="button"
                onClick={onDelete}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-red-700"
              >
                Delete
              </button>
              <button type="button" onClick={() => setConfirmingDelete(false)} className={button}>
                Keep
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmingDelete(true)} className={`${button} hover:border-red-300 hover:text-red-600`}>
              Delete board
            </button>
          )}
        </div>
      </header>

      <div role="search" className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={filter.query}
          onChange={(e) => setFilter({ ...filter, query: e.target.value })}
          placeholder="Search cards"
          aria-label="Search cards"
          className={`${input} w-64`}
        />
        <select
          value={filter.priority}
          onChange={(e) => setFilter({ ...filter, priority: e.target.value as Priority | "" })}
          aria-label="Filter by priority"
          className={input}
        >
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p[0].toUpperCase() + p.slice(1)} priority
            </option>
          ))}
        </select>
        {filtering && (
          <button type="button" onClick={() => setFilter({ query: "", priority: "" })} className={button}>
            Clear filters
          </button>
        )}
      </div>

      <DndContext
        id="kanban"
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="flex flex-1 gap-4 overflow-x-auto pb-4">
          {board.columns.map((column) => (
            <KanbanColumn
              key={column.id}
              column={column}
              cards={column.cardIds.map((id) => board.cards[id]).filter((card) => matchesFilter(card, filter))}
              overdue={overdue}
              onRename={(title) => onChange(renameColumn(board, column.id, title), false)}
              onRenameDone={() => onChange(board)}
              onAdd={(title, details) =>
                onChange(addCard(board, column.id, newCard(crypto.randomUUID(), { title, details })))
              }
              onEdit={(cardId, fields) => onChange(updateCard(board, cardId, fields))}
              onDelete={(cardId) => onChange(deleteCard(board, cardId))}
            />
          ))}
        </div>
        <DragOverlay>{activeId && <CardView card={board.cards[activeId]} overdue={overdue.has(activeId)} overlay />}</DragOverlay>
      </DndContext>
    </main>
  );
}
