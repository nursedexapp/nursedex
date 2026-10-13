// src/lib/consent/sentry-replay.test.ts
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  client: {} as object | undefined,
  replay: undefined as { stop: () => Promise<void> } | undefined,
  added: [] as unknown[],
}));

vi.mock("@sentry/nextjs", () => ({
  getClient: () => h.client,
  getReplay: () => h.replay,
  replayIntegration: () => ({ name: "Replay" }),
  addIntegration: (i: unknown) => h.added.push(i),
}));

import { startSentryReplay, stopSentryReplay } from "./sentry-replay";

beforeEach(() => {
  h.client = {};
  h.replay = undefined;
  h.added = [];
});

describe("startSentryReplay", () => {
  it("adds the replay integration once", () => {
    startSentryReplay();
    expect(h.added).toEqual([{ name: "Replay" }]);
  });

  it("never adds a second one, which Sentry refuses with an error", () => {
    h.replay = { stop: vi.fn(async () => {}) };
    startSentryReplay();
    expect(h.added).toEqual([]);
  });

  it("does nothing when Sentry is not initialised", () => {
    h.client = undefined;
    startSentryReplay();
    expect(h.added).toEqual([]);
  });
});

describe("stopSentryReplay", () => {
  it("stops a running replay", () => {
    const stop = vi.fn(async () => {});
    h.replay = { stop };
    stopSentryReplay();
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
