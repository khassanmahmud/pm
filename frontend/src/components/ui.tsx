import type { Priority } from "@/lib/board";

// Class names shared by several components.

/** Text input on full-page forms (sign in, account). */
export const formInput =
  "w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-navy outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";
/** Text input on small inline forms (new board, new card, card editor). */
export const inlineInput =
  "w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm text-navy outline-none placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/20";
export const fieldLabel = "text-xs font-medium uppercase tracking-wide text-muted";
export const submitButton =
  "rounded-md bg-secondary px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-secondary/90";
export const cancelButton = "rounded-md px-3 py-1.5 text-sm text-muted transition hover:bg-slate-100 hover:text-navy";
export const outlineButton =
  "rounded-md border border-slate-200 px-3 py-1.5 text-sm text-muted transition hover:border-primary hover:text-primary";

export function priorityName(priority: Priority): string {
  return priority[0].toUpperCase() + priority.slice(1);
}

export function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
    </svg>
  );
}
