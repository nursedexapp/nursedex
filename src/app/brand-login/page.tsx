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
    <main className="min-h-screen bg-teal-dark flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-12">
          <div className="w-16 h-16 rounded-xl bg-teal flex items-center justify-center mb-6">
            <span className="font-heading text-2xl font-semibold text-warm-white tracking-[-0.06em] leading-none select-none">
              ND
            </span>
          </div>
          <h1 className="font-heading text-2xl text-warm-white">NurseDex</h1>
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
            className="w-full bg-warm-white/10 border border-sage/30 rounded-xl px-4 py-3 font-body text-warm-white placeholder:text-sage/50 focus:outline-none focus:border-sage focus:ring-1 focus:ring-sage/30"
          />
          {error && (
            <p className="font-body text-sm text-error mt-2">
              Wrong password.
            </p>
          )}
          <button
            type="submit"
            className="w-full mt-4 bg-teal text-warm-white font-body font-medium py-3 rounded-xl hover:bg-teal-light transition-colors"
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
