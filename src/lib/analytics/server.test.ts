// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * captureServerEventAfterResponse is the only thing standing between an
 * analytics call and a login.
 *
 * `after()` THROWS when it is called outside a request scope, so without the
 * catch inside the helper an analytics call would take signIn, selectRole and
 * the auth callback down with it. The catch, though, fails in the reassuring
 * direction: it makes every test pass whether the event is scheduled or not.
 * So both halves are pinned here, and the happy path is asserted FIRST, since
 * a helper that never schedules anything would otherwise satisfy the failure
 * test on its own.
 */

const h = vi.hoisted(() => ({
  afterImpl: null as ((fn: () => unknown) => void) | null,
  captured: [] as { distinctId: string; event: string }[],
  optedOut: new Set<string>(),
}));

vi.mock("next/server", () => ({
  after: (fn: () => unknown) => h.afterImpl?.(fn),
}));

vi.mock("./opt-out", () => ({
  hasOptedOutOfAnalytics: async (userId: string) => h.optedOut.has(userId),
}));

vi.mock("posthog-node", () => ({
  PostHog: class {
    async captureImmediate(args: {
      distinctId: string;
      event: string;
      properties?: Record<string, unknown>;
    }) {
      h.captured.push(args);
    }
  },
}));

import { captureServerEventAfterResponse, captureServerEvent } from "./server";

beforeEach(() => {
  h.captured.length = 0;
  h.afterImpl = null;
  h.optedOut.clear();
  process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
  process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://us.i.posthog.com";
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("captureServerEventAfterResponse", () => {
  it("schedules the capture, and the scheduled work really captures", async () => {
    const scheduled: (() => unknown)[] = [];
    h.afterImpl = (fn) => scheduled.push(fn);

    captureServerEventAfterResponse({
      distinctId: "user-1",
      event: "login",
      properties: { role: "nurse" },
    });

    expect(scheduled).toHaveLength(1);
    // Nothing has been sent yet: the whole point is that it runs after the
    // response, not during it.
    expect(h.captured).toEqual([]);

    await scheduled[0]();
    expect(h.captured).toEqual([
      // The properties matter as much as the name: a login with no role on it
      // cannot answer whether nurses or families are the ones signing in.
      { distinctId: "user-1", event: "login", properties: { role: "nurse" } },
    ]);
  });

  it("does not throw, or take the caller down, when there is no request scope", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    h.afterImpl = () => {
      throw new Error("`after` was called outside a request scope");
    };

    expect(() =>
      captureServerEventAfterResponse({ distinctId: "user-1", event: "login" }),
    ).not.toThrow();

    // Survivable is not the same as silent: a systematic loss has to be
    // visible in the runtime logs, or it looks like an audience that stopped
    // signing up.
    expect(logged).toHaveBeenCalledTimes(1);
    expect(String(logged.mock.calls[0]?.[1])).toBe("login");
  });
});

describe("captureServerEvent", () => {
  it("never throws when PostHog itself fails", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { PostHog } = await import("posthog-node");
    vi.spyOn(PostHog.prototype, "captureImmediate").mockRejectedValue(
      new Error("posthog is down"),
    );

    await expect(
      captureServerEvent({ distinctId: "user-1", event: "login" }),
    ).resolves.toBeUndefined();
    expect(logged).toHaveBeenCalled();
  });

  it("no-ops rather than throwing when the keys are absent", async () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    await expect(
      captureServerEvent({ distinctId: "user-1", event: "login" }),
    ).resolves.toBeUndefined();
    expect(h.captured).toEqual([]);
  });
});

/**
 * #715. The client-side opt-out cannot reach these calls at all: they fire
 * from Stripe webhooks and from auth paths, where the person's browser is not
 * involved. So the refusal has to happen here too, or opting out would quietly
 * mean "opted out of most tracking".
 */
describe("captureServerEvent honours an analytics opt-out", () => {
  it("sends for somebody who has not opted out", async () => {
    // Asserted first and deliberately: a helper that sent NOTHING would
    // satisfy every refusal test below on its own.
    await captureServerEvent({ distinctId: "user-1", event: "login" });
    expect(h.captured).toEqual([
      { distinctId: "user-1", event: "login", properties: undefined },
    ]);
  });

  it("sends nothing for somebody who has opted out", async () => {
    h.optedOut.add("user-1");
    await captureServerEvent({ distinctId: "user-1", event: "login" });
    expect(h.captured).toEqual([]);
  });

  it("refuses only the person who opted out", async () => {
    h.optedOut.add("user-1");
    await captureServerEvent({ distinctId: "user-1", event: "login" });
    await captureServerEvent({ distinctId: "user-2", event: "login" });
    expect(h.captured.map((c) => c.distinctId)).toEqual(["user-2"]);
  });

  it("refuses through the after-response path as well", async () => {
    // Two entry points, and the scheduled one is the one used by the auth
    // paths, so a check on only the direct call would leave logins tracked.
    h.optedOut.add("user-1");
    h.afterImpl = (fn) => void fn();
    captureServerEventAfterResponse({ distinctId: "user-1", event: "login" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(h.captured).toEqual([]);
  });
});
