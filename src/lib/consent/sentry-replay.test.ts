// src/lib/consent/sentry-replay.test.ts
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";

type FakeReplay = {
  stop: () => Promise<void>;
  start: () => void;
  startBuffering: () => void;
  getReplayId: () => string | undefined;
};

const h = vi.hoisted(() => ({
  client: undefined as
    { getOptions: () => Record<string, number | undefined> } | undefined,
  options: {} as Record<string, number | undefined>,
  replay: undefined as FakeReplay | undefined,
  added: [] as unknown[],
}));

vi.mock("@sentry/nextjs", () => ({
  getClient: () => h.client,
  getReplay: () => h.replay,
  replayIntegration: () => ({ name: "Replay" }),
  addIntegration: (i: unknown) => h.added.push(i),
}));

import { startSentryReplay, stopSentryReplay } from "./sentry-replay";

function fakeReplay(id: string | undefined): FakeReplay {
  return {
    stop: vi.fn(async () => {}),
    start: vi.fn(),
    startBuffering: vi.fn(),
    getReplayId: () => id,
  };
}

beforeEach(() => {
  h.options = { replaysSessionSampleRate: 0.1, replaysOnErrorSampleRate: 1 };
  h.client = { getOptions: () => h.options };
  h.replay = undefined;
  h.added = [];
});

describe("startSentryReplay", () => {
  it("adds the replay integration once", () => {
    startSentryReplay();
    expect(h.added).toEqual([{ name: "Replay" }]);
  });

  it("never adds a second one, which Sentry refuses with an error", () => {
    h.replay = fakeReplay("running");
    startSentryReplay();
    expect(h.added).toEqual([]);
  });

  it("leaves a replay that is running alone", () => {
    const replay = fakeReplay("running");
    h.replay = replay;
    startSentryReplay();
    expect(replay.start).not.toHaveBeenCalled();
    expect(replay.startBuffering).not.toHaveBeenCalled();
  });

  it("restarts a stopped replay, sampled like a new one: recording the whole session when sampled", () => {
    h.options.replaysSessionSampleRate = 1;
    const replay = fakeReplay(undefined);
    h.replay = replay;
    startSentryReplay();
    expect(replay.start).toHaveBeenCalledTimes(1);
    expect(replay.startBuffering).not.toHaveBeenCalled();
    expect(h.added).toEqual([]);
  });

  it("restarts a stopped replay, sampled like a new one: buffering for errors when not", () => {
    h.options.replaysSessionSampleRate = 0;
    const replay = fakeReplay(undefined);
    h.replay = replay;
    startSentryReplay();
    expect(replay.start).not.toHaveBeenCalled();
    expect(replay.startBuffering).toHaveBeenCalledTimes(1);
  });

  it("restarts nothing when neither rate would record", () => {
    h.options = { replaysSessionSampleRate: 0, replaysOnErrorSampleRate: 0 };
    const replay = fakeReplay(undefined);
    h.replay = replay;
    startSentryReplay();
    expect(replay.start).not.toHaveBeenCalled();
    expect(replay.startBuffering).not.toHaveBeenCalled();
  });

  it("does nothing when Sentry is not initialised", () => {
    h.client = undefined;
    startSentryReplay();
    expect(h.added).toEqual([]);
  });
});

describe("stopSentryReplay", () => {
  it("stops a running replay", () => {
    const replay = fakeReplay("running");
    h.replay = replay;
    stopSentryReplay();
    expect(replay.stop).toHaveBeenCalledTimes(1);
  });

  it("handles a stop that fails, so it never surfaces as an unhandled rejection", async () => {
    let fail: (reason: Error) => void = () => {};
    const stopping = new Promise<void>((_, reject) => {
      fail = reject;
    });
    const handled = vi.spyOn(stopping, "catch");
    h.replay = { ...fakeReplay("running"), stop: () => stopping };
    stopSentryReplay();
    expect(handled).toHaveBeenCalledTimes(1);
    fail(new Error("flush failed"));
    await expect(stopping).rejects.toThrow("flush failed");
  });
});
