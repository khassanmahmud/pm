"use client";

import { useState } from "react";

export function LoginForm({ onLogin }: { onLogin: (username: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (response.ok) {
      onLogin((await response.json()).username);
    } else {
      setError("Invalid username or password");
    }
  }

  const input =
    "w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-navy outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

  return (
    <main className="flex flex-1 items-center justify-center px-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200/70 bg-white p-8 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-navy">Sign in</h1>
          <div className="mt-3 h-1 w-12 rounded-full bg-accent" />
        </div>
        <label className="block space-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Username</span>
          <input required autoFocus value={username} onChange={(e) => setUsername(e.target.value)} className={input} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Password</span>
          <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="w-full rounded-md bg-secondary px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-secondary/90"
        >
          Sign in
        </button>
      </form>
    </main>
  );
}
