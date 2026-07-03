"use client";

import { useState } from "react";

/**
 * TEMPORARY diagnostic page to confirm Sentry is actually capturing
 * client-side errors after wiring it up (#394, #395). Delete this
 * directory once verified.
 */
export default function SentryTestPage() {
  const [serverResult, setServerResult] = useState<string | null>(null);

  return (
    <main style={{ padding: 40, fontFamily: "sans-serif" }}>
      <h1>Sentry diagnostic (temporary)</h1>
      <p>
        Click each button, then check the Sentry Issues feed for two new
        events (one client, one server).
      </p>
      <button
        type="button"
        onClick={() => {
          throw new Error("Sentry test: deliberate client-side error");
        }}
      >
        Throw client-side error
      </button>
      <br />
      <br />
      <button
        type="button"
        onClick={async () => {
          const res = await fetch("/api/debug/sentry-test");
          setServerResult(`Server responded with status ${res.status}`);
        }}
      >
        Trigger server-side error
      </button>
      {serverResult && <p>{serverResult}</p>}
    </main>
  );
}
