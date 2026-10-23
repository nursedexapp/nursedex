// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { fetchRetryingOnce, retryDelayMs } from "./retry-once";

function answer(status: number, retryAfter?: string): Response {
  const headers = new Headers();
  if (retryAfter !== undefined) headers.set("retry-after", retryAfter);
  return new Response(status === 200 ? "{}" : "busy", { status, headers });
}

/** A fetch that gives each answer in turn, counting how often it was asked. */
function answers(...statuses: number[]) {
  let calls = 0;
  const doFetch = async () =>
    answer(statuses[Math.min(calls++, statuses.length - 1)]);
  return { doFetch, calls: () => calls };
}

describe("fetchRetryingOnce", () => {
  it("asks again once after a server error, and returns the second answer", async () => {
    const { doFetch, calls } = answers(500, 200);
    const sleep = vi.fn(async (_ms: number) => {});
    const res = await fetchRetryingOnce(doFetch, { sleep });
    expect(res.status).toBe(200);
    expect(calls()).toBe(2);
    expect(sleep).toHaveBeenCalledExactlyOnceWith(2_000);
  });

  it("retries a 429 after the delay the server names", async () => {
    let calls = 0;
    const doFetch = async () =>
      calls++ === 0 ? answer(429, "3") : answer(200);
    const sleep = vi.fn(async (_ms: number) => {});
    const res = await fetchRetryingOnce(doFetch, { sleep });
    expect(res.status).toBe(200);
    expect(sleep).toHaveBeenCalledExactlyOnceWith(3_000);
  });

  it("returns the second refusal rather than asking a third time", async () => {
    const { doFetch, calls } = answers(503, 502, 200);
    const res = await fetchRetryingOnce(doFetch, { sleep: async () => {} });
    expect(res.status).toBe(502);
    expect(calls()).toBe(2);
  });

  it("does not retry a refusal that asking again cannot change", async () => {
    for (const status of [401, 403, 404, 422]) {
      const { doFetch, calls } = answers(status, 200);
      const res = await fetchRetryingOnce(doFetch, { sleep: async () => {} });
      expect(res.status).toBe(status);
      expect(calls()).toBe(1);
    }
  });

  it("tells the caller about the retry, so a blip is counted and not only absorbed", async () => {
    const { doFetch } = answers(500, 200);
    const onRetry = vi.fn();
    await fetchRetryingOnce(doFetch, { sleep: async () => {}, onRetry });
    expect(onRetry).toHaveBeenCalledOnce();
    expect(onRetry.mock.calls[0][0].status).toBe(500);
  });

  it("releases the refused answer's body before asking again", async () => {
    // An unread body holds its connection open until garbage collection.
    const cancel = vi.fn();
    let calls = 0;
    const doFetch = async () =>
      calls++ === 0
        ? new Response(new ReadableStream({ cancel }), { status: 500 })
        : answer(200);
    await fetchRetryingOnce(doFetch, { sleep: async () => {} });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("does not retry when the caller's retry budget is spent", async () => {
    const { doFetch, calls } = answers(500, 200);
    const res = await fetchRetryingOnce(doFetch, {
      sleep: async () => {},
      mayRetry: () => false,
    });
    expect(res.status).toBe(500);
    expect(calls()).toBe(1);
  });
});

describe("retryDelayMs", () => {
  it("defaults to two seconds when the server names no delay or nonsense", () => {
    expect(retryDelayMs(null)).toBe(2_000);
    expect(retryDelayMs("soon")).toBe(2_000);
    expect(retryDelayMs("-1")).toBe(2_000);
  });

  it("caps a long named delay at ten seconds", () => {
    expect(retryDelayMs("60")).toBe(10_000);
  });
});
