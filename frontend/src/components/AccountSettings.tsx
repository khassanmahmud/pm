"use client";

import { useState } from "react";
import { api } from "@/lib/api";

type Props = { username: string; onDeleted: () => void; onUnauthorized: () => void };

type Status = { ok: boolean; text: string } | null;

const input =
  "w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-navy outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";
const label = "text-xs font-medium uppercase tracking-wide text-muted";

function Message({ status }: { status: Status }) {
  if (!status) return null;
  return (
    <p role={status.ok ? "status" : "alert"} className={`text-sm ${status.ok ? "text-green-700" : "text-red-600"}`}>
      {status.text}
    </p>
  );
}

export function AccountSettings({ username, onDeleted, onUnauthorized }: Props) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<Status>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteStatus, setDeleteStatus] = useState<Status>(null);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    const response = await api("/api/account/password", "POST", { currentPassword, newPassword });
    if (response.status === 401) return onUnauthorized();
    if (response.ok) {
      setCurrentPassword("");
      setNewPassword("");
      setPasswordStatus({ ok: true, text: "Password changed" });
    } else {
      setPasswordStatus({
        ok: false,
        text: response.status === 403 ? "Current password is incorrect" : "New password must be 8-128 characters",
      });
    }
  }

  async function deleteAccount(e: React.FormEvent) {
    e.preventDefault();
    const response = await api("/api/account", "DELETE", { password: deletePassword });
    if (response.status === 401) return onUnauthorized();
    if (response.ok) return onDeleted();
    setDeleteStatus({ ok: false, text: "Password is incorrect" });
  }

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-6 py-6">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Account</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight text-navy">{username}</h1>
      <div className="mt-3 h-1 w-16 rounded-full bg-accent" />

      <form onSubmit={changePassword} className="mt-8 space-y-4 rounded-2xl border border-slate-200/70 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-navy">Change password</h2>
        <label className="block space-y-1">
          <span className={label}>Current password</span>
          <input
            required
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className={input}
          />
        </label>
        <label className="block space-y-1">
          <span className={label}>New password</span>
          <input
            required
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={input}
          />
        </label>
        <Message status={passwordStatus} />
        <button
          type="submit"
          className="rounded-md bg-secondary px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-secondary/90"
        >
          Change password
        </button>
      </form>

      <form onSubmit={deleteAccount} className="mt-6 space-y-4 rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-red-700">Delete account</h2>
        <p className="text-sm text-muted">This permanently deletes your account and all of your boards.</p>
        <label className="block space-y-1">
          <span className={label}>Confirm with your password</span>
          <input
            required
            type="password"
            autoComplete="current-password"
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
            className={input}
          />
        </label>
        <Message status={deleteStatus} />
        <button
          type="submit"
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-red-700"
        >
          Delete account
        </button>
      </form>
    </main>
  );
}
