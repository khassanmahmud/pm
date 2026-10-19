"use client";

import { useState } from "react";
import { api } from "@/lib/api";

const REGISTER_ERRORS: Record<number, string> = {
  409: "That username is already taken",
  422: "Use 3-32 letters, digits, dots, dashes or underscores, and a password of at least 8 characters",
};

export function LoginForm({ onLogin }: { onLogin: (username: string) => void }) {
  const [registering, setRegistering] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const response = await api(registering ? "/api/register" : "/api/login", "POST", { username, password });
    if (response.ok) {
      onLogin((await response.json()).username);
    } else if (registering) {
      setError(REGISTER_ERRORS[response.status] ?? "Could not create the account");
    } else {
      setError("Invalid username or password");
    }
  }

  function toggle() {
    setRegistering(!registering);
    setError("");
  }

  const input =
    "w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-navy outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";
  const title = registering ? "Create account" : "Sign in";

  return (
    <main className="flex flex-1 items-center justify-center px-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200/70 bg-white p-8 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-navy">{title}</h1>
          <div className="mt-3 h-1 w-12 rounded-full bg-accent" />
        </div>
        <label className="block space-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Username</span>
          <input
            required
            autoFocus
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={input}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Password</span>
          <input
            required
            type="password"
            autoComplete={registering ? "new-password" : "current-password"}
            minLength={registering ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={input}
          />
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
          {title}
        </button>
        <p className="text-center text-sm text-muted">
          {registering ? "Already have an account?" : "New here?"}{" "}
          <button type="button" onClick={toggle} className="font-medium text-primary hover:underline">
            {registering ? "Sign in" : "Create an account"}
          </button>
        </p>
      </form>
    </main>
  );
}
