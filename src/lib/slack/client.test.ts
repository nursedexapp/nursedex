// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import crypto from "node:crypto";
import { verifySlackRequest } from "./client";

const SECRET = "test-signing-secret";

// Fixed clock so the 5 minute replay window is deterministic.
const NOW_MS = 1_700_000_000_000;
const NOW_S = Math.floor(NOW_MS / 1000);

// Reproduce Slack's v0 signing scheme to mint signatures the verifier accepts.
function sign(body: string, ts: string, secret = SECRET): string {
  const base = `v0:${ts}:${body}`;
  const digest = crypto.createHmac("sha256", secret).update(base).digest("hex");
  return `v0=${digest}`;
}

const BODY = "payload=%7B%22type%22%3A%22shortcut%22%7D";

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW_MS);
});

afterAll(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  process.env.SLACK_SIGNING_SECRET = SECRET;
});

describe("verifySlackRequest", () => {
  it("accepts a valid signature for a current timestamp", () => {
    const ts = String(NOW_S);
    expect(verifySlackRequest(BODY, sign(BODY, ts), ts)).toBe(true);
  });

  it("rejects a timestamp older than the 5 minute replay window", () => {
    const ts = String(NOW_S - 6 * 60); // 6 minutes old
    // The signature itself is valid for this timestamp; only the age is bad.
    expect(verifySlackRequest(BODY, sign(BODY, ts), ts)).toBe(false);
  });

  it("rejects a tampered body", () => {
    const ts = String(NOW_S);
    const sig = sign(BODY, ts);
    expect(verifySlackRequest(`${BODY}&tampered=1`, sig, ts)).toBe(false);
  });

  it("rejects a signature made with the wrong secret", () => {
    const ts = String(NOW_S);
    expect(verifySlackRequest(BODY, sign(BODY, ts, "wrong-secret"), ts)).toBe(
      false,
    );
  });

  it("rejects a missing signature header", () => {
    expect(verifySlackRequest(BODY, null, String(NOW_S))).toBe(false);
  });

  it("rejects a missing timestamp header", () => {
    expect(verifySlackRequest(BODY, sign(BODY, String(NOW_S)), null)).toBe(
      false,
    );
  });

  it("rejects a non-numeric timestamp", () => {
    const sig = sign(BODY, "not-a-number");
    expect(verifySlackRequest(BODY, sig, "not-a-number")).toBe(false);
  });

  it("rejects a signature of the wrong length", () => {
    // Length mismatch must short-circuit before the constant-time compare.
    expect(verifySlackRequest(BODY, "v0=short", String(NOW_S))).toBe(false);
  });

  it("rejects everything when no signing secret is configured", () => {
    const ts = String(NOW_S);
    const sig = sign(BODY, ts);
    delete process.env.SLACK_SIGNING_SECRET;
    expect(verifySlackRequest(BODY, sig, ts)).toBe(false);
  });
});
