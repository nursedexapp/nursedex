// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse, type NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  slackPost: vi.fn(async () => ({ ok: true })),
  recordCronHeartbeat: vi.fn(async () => {}),
  createServiceRoleClient: vi.fn(() => ({ marker: "service-role" })),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: h.captureException,
  captureMessage: h.captureMessage,
}));
vi.mock("@/lib/slack/client", () => ({
  slackPost: h.slackPost,
  ALERTS_CHANNEL_ID: "C_TEST_ALERTS",
}));
vi.mock("./heartbeat", () => ({
  recordCronHeartbeat: h.recordCronHeartbeat,
}));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: h.createServiceRoleClient,
}));

import { withCronAlerting } from "./alerting";

function fakeRequest(): NextRequest {
  return { headers: { get: () => "Bearer test" } } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("withCronAlerting", () => {
  it("returns the handler's response unchanged on success", async () => {
    const ok = NextResponse.json({ success: true });
    const handler = vi.fn(async () => ok);

    const res = await withCronAlerting("test-job", handler)(fakeRequest());

    expect(res).toBe(ok);
    expect(h.captureException).not.toHaveBeenCalled();
    expect(h.slackPost).not.toHaveBeenCalled();
  });

  it("captures to Sentry and alerts Slack when the handler throws", async () => {
    const handler = vi.fn(async () => {
      throw new Error("db unavailable");
    });

    const res = await withCronAlerting("test-job", handler)(fakeRequest());

    expect(res.status).toBe(500);
    expect(h.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: expect.objectContaining({ job: "test-job" }) }),
    );
    expect(h.slackPost).toHaveBeenCalledWith(
      "chat.postMessage",
      expect.objectContaining({
        channel: "C_TEST_ALERTS",
        text: expect.stringContaining("test-job"),
      }),
    );
  });

  it("alerts Slack and captures a Sentry message when the handler returns non-2xx without throwing", async () => {
    const failed = NextResponse.json({ error: "Query failed" }, { status: 500 });
    const handler = vi.fn(async () => failed);

    const res = await withCronAlerting("test-job", handler)(fakeRequest());

    expect(res).toBe(failed);
    // Tagged the same way as the throw path (action: "cron", job) so the
    // Sentry-to-Slack issue poller can recognize this was already alerted
    // here and skip it, instead of posting a duplicate Slack message.
    expect(h.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining("test-job"),
      expect.objectContaining({
        level: "error",
        tags: expect.objectContaining({ action: "cron", job: "test-job" }),
      }),
    );
    expect(h.slackPost).toHaveBeenCalledWith(
      "chat.postMessage",
      expect.objectContaining({ channel: "C_TEST_ALERTS" }),
    );
  });

  it("still returns 500 (handler threw) even if the Slack alert itself fails", async () => {
    h.slackPost.mockRejectedValueOnce(new Error("slack down"));
    const handler = vi.fn(async () => {
      throw new Error("db unavailable");
    });

    const res = await withCronAlerting("test-job", handler)(fakeRequest());

    expect(res.status).toBe(500);
  });
});

/**
 * The heartbeat half of the same wrapper (#757).
 *
 * It lives here rather than in each route because this wrapper already wraps
 * every one of the thirteen crons, so every current job and every future one
 * is covered by one seam instead of thirteen edits that somebody has to
 * remember (L247).
 */
describe("withCronAlerting heartbeats", () => {
  it("records a heartbeat when the job succeeds", async () => {
    const handler = vi.fn(async () => NextResponse.json({ success: true, sent: 2 }));

    await withCronAlerting("access-expiry", handler)(fakeRequest());

    expect(h.recordCronHeartbeat).toHaveBeenCalledTimes(1);
    const [, args] = h.recordCronHeartbeat.mock.calls[0] as unknown as [
      unknown,
      { jobName: string; result: unknown },
    ];
    expect(args.jobName).toBe("access-expiry");
    expect(args.result).toMatchObject({ success: true, sent: 2 });
  });

  /**
   * The whole point of the record is that its absence means something. A run
   * that threw, or that answered 500, has not done its work, and marking it as
   * a success would tell the watchdog the job is alive on the strength of a
   * run that failed (L12).
   */
  it("records nothing when the job throws", async () => {
    const handler = vi.fn(async (): Promise<NextResponse> => {
      throw new Error("db unavailable");
    });

    await withCronAlerting("access-expiry", handler)(fakeRequest());

    expect(h.recordCronHeartbeat).not.toHaveBeenCalled();
  });

  it("records nothing when the job answers non-2xx", async () => {
    const handler = vi.fn(async () =>
      NextResponse.json({ error: "Query failed" }, { status: 500 }),
    );

    await withCronAlerting("access-expiry", handler)(fakeRequest());

    expect(h.recordCronHeartbeat).not.toHaveBeenCalled();
  });

  // Measured from an injected clock rather than a real one, so the assertion
  // is about the wrapper and not about how busy the machine was (L290).
  it("measures how long the job took", async () => {
    const ticks = [1_000, 3_500];
    const handler = vi.fn(async () => NextResponse.json({ success: true }));

    await withCronAlerting("access-expiry", handler, {
      now: () => ticks.shift() ?? 0,
    })(fakeRequest());

    const [, args] = h.recordCronHeartbeat.mock.calls[0] as unknown as [
      unknown,
      { durationMs: number },
    ];
    expect(args.durationMs).toBe(2500);
  });

  /**
   * The response the caller gets must be the handler's own, untouched. Reading
   * the body to keep the run's result would consume it and hand Vercel an
   * already-read stream, so it is read from a clone.
   */
  it("returns the handler's own response after reading the result", async () => {
    const ok = NextResponse.json({ success: true });
    const handler = vi.fn(async () => ok);

    const res = await withCronAlerting("access-expiry", handler)(fakeRequest());

    expect(res).toBe(ok);
    await expect(res.json()).resolves.toMatchObject({ success: true });
  });

  /**
   * The heartbeat is bookkeeping ABOUT the run. Building the client it needs
   * can fail on its own (a missing key, a bad URL), and that must not turn a
   * cron that did its work into a 500: on a dunning job that would fire the
   * failure alert and read as enforcement breaking.
   */
  it("does not fail a successful run when the heartbeat client cannot be built", async () => {
    h.createServiceRoleClient.mockImplementationOnce(() => {
      throw new Error("SUPABASE_SECRET_KEY is missing");
    });
    const handler = vi.fn(async () => NextResponse.json({ success: true }));

    const res = await withCronAlerting("access-expiry", handler)(fakeRequest());

    expect(res.status).toBe(200);
    expect(h.slackPost).not.toHaveBeenCalled();
    expect(h.captureException).toHaveBeenCalled();
  });

  // A route that answers 200 with something that is not JSON must still leave a
  // heartbeat: the run happened, and only the result is unreadable.
  it("still records the run when the body is not JSON", async () => {
    const handler = vi.fn(async () => new NextResponse("OK", { status: 200 }));

    await withCronAlerting("blog-image-gc", handler)(fakeRequest());

    expect(h.recordCronHeartbeat).toHaveBeenCalledTimes(1);
  });
});
