"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const searchParams = useSearchParams();
  const from = searchParams.get("from") || "/";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      window.location.href = from;
    } else {
      setError(true);
      setPassword("");
    }
  };

  return (
    <main className="bg-teal-dark flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-12 flex flex-col items-center">
          <div className="bg-teal mb-6 flex h-16 w-16 items-center justify-center rounded-xl">
            <span className="font-heading text-warm-white text-2xl leading-none font-semibold tracking-[-0.06em] select-none">
              ND
            </span>
          </div>
          <h1 className="font-heading text-warm-white text-2xl">NurseDex</h1>
        </div>

        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(false);
            }}
            placeholder="Password"
            autoFocus
            className="bg-warm-white/10 border-sage/30 font-body text-warm-white placeholder:text-sage/50 focus:border-sage focus:ring-sage/30 w-full rounded-xl border px-4 py-3 focus:ring-1 focus:outline-none"
          />
          {error && (
            <p className="font-body text-error mt-2 text-sm">Wrong password.</p>
          )}
          <button
            type="submit"
            className="bg-teal text-warm-white font-body hover:bg-teal-light mt-4 w-full rounded-xl py-3 font-medium transition-colors"
          >
            Enter
          </button>
        </form>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
