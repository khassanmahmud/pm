"use client";

import { useState } from "react";
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
import { addCard, deleteCard, findColumnId, moveCard, renameColumn, updateCard, type Board } from "@/lib/board";
import { KanbanColumn } from "./KanbanColumn";
import { CardView } from "./KanbanCard";

// Prefer what is under the pointer; closestCorners alone picks nearby cards over tall empty columns.
const collisionDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : closestCorners(args);
};

type Props = {
  board: Board;
  onChange: (board: Board, persist?: boolean) => void;
  onLogout: () => void;
  locked?: boolean;
};

export function KanbanBoard({ board, onChange, onLogout, locked = false }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function targetIndex(overId: string, columnId: string) {
    const cardIds = board.columns.find((c) => c.id === columnId)!.cardIds;
    return overId === columnId ? cardIds.length : cardIds.indexOf(overId);
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

  return (
    <main
      inert={locked}
      className={`mx-auto flex w-full min-w-0 max-w-[1600px] flex-1 flex-col px-6 py-8 transition-opacity ${locked ? "opacity-60" : ""}`}
    >
      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Project board</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-navy">Product Launch</h1>
          <div className="mt-3 h-1 w-16 rounded-full bg-accent" />
        </div>
        <div className="flex items-center gap-4">
          <p className="hidden text-sm text-muted sm:block">
            {totalCards} cards across {board.columns.length} columns
          </p>
          <button
            type="button"
            onClick={onLogout}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-muted transition hover:border-primary hover:text-primary"
          >
            Log out
          </button>
        </div>
      </header>

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
              cards={column.cardIds.map((id) => board.cards[id])}
              onRename={(title) => onChange(renameColumn(board, column.id, title), false)}
              onRenameDone={() => onChange(board)}
              onAdd={(title, details) =>
                onChange(addCard(board, column.id, { id: crypto.randomUUID(), title, details }))
              }
              onEdit={(cardId, title, details) => onChange(updateCard(board, cardId, title, details))}
              onDelete={(cardId) => onChange(deleteCard(board, cardId))}
            />
          ))}
        </div>
        <DragOverlay>{activeId && <CardView card={board.cards[activeId]} overlay />}</DragOverlay>
      </DndContext>
    </main>
  );
}
