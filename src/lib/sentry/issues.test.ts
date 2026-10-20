// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.SENTRY_AUTH_TOKEN = "test-token";
  process.env.SENTRY_ORG = "nursedex";
  process.env.SENTRY_PROJECT = "nursedex-site";
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
  vi.resetModules();
});

function jsonResponse(body: unknown, linkHeader?: string): Response {
  const headers = new Headers();
  if (linkHeader) headers.set("link", linkHeader);
  return new Response(JSON.stringify(body), { status: 200, headers });
}

describe("getIssuesNeedingReview", () => {
  it("queries for issues needing review, excluding cron/webhook-tagged ones", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse([]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { getIssuesNeedingReview } = await import("./issues");
    await getIssuesNeedingReview();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe(
      "/api/0/projects/nursedex/nursedex-site/issues/",
    );
    expect(parsed.searchParams.get("query")).toBe(
      "is:for_review level:[error,fatal] !action:cron !action:stripe-webhook",
    );
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer test-token",
    );
  });

  it("maps the response into the fields the alert route needs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse([
          {
            id: "123",
            shortId: "NURSEDEX-SITE-6",
            title: "TypeError: x is not a function",
            culprit: "app/nurses/page",
            level: "error",
            permalink: "https://nursedex.sentry.io/issues/123/",
          },
        ]),
      ),
    );

    const { getIssuesNeedingReview } = await import("./issues");
    const issues = await getIssuesNeedingReview();

    expect(issues).toEqual([
      {
        id: "123",
        shortId: "NURSEDEX-SITE-6",
        title: "TypeError: x is not a function",
        culprit: "app/nurses/page",
        level: "error",
        permalink: "https://nursedex.sentry.io/issues/123/",
      },
    ]);
  });

  it("follows pagination cursors until results is false", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          [{ id: "1", title: "a", culprit: "", level: "error", permalink: "" }],
          '<https://sentry.io/api/0/projects/nursedex/nursedex-site/issues/?cursor=0:100:0>; rel="next"; results="true"; cursor="0:100:0"',
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          [{ id: "2", title: "b", culprit: "", level: "error", permalink: "" }],
          '<https://sentry.io/api/0/projects/nursedex/nursedex-site/issues/?cursor=0:200:0>; rel="next"; results="false"; cursor="0:200:0"',
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { getIssuesNeedingReview } = await import("./issues");
    const issues = await getIssuesNeedingReview();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(issues.map((i) => i.id)).toEqual(["1", "2"]);
    const secondUrl = new URL(fetchMock.mock.calls[1][0] as string);
    expect(secondUrl.searchParams.get("cursor")).toBe("0:100:0");
  });

  it("stops after a safety cap of pages even if Sentry keeps saying there's more", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        [{ id: "x", title: "x", culprit: "", level: "error", permalink: "" }],
        '<https://sentry.io/x>; rel="next"; results="true"; cursor="0:100:0"',
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { getIssuesNeedingReview } = await import("./issues");
    await getIssuesNeedingReview();

    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(5);
  });

  it("throws on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 401 })),
    );

    const { getIssuesNeedingReview } = await import("./issues");
    await expect(getIssuesNeedingReview()).rejects.toThrow(/401/);
  });

  // One busy answer from Sentry's gateway paged ops on 2026-10-19 while the
  // job itself sends one request every 15 minutes (NURSEDEX-SITE-H). A single
  // retry absorbs the blip; a second refusal still throws, so a real outage
  // reaches the channel on its first run.
  describe("when Sentry refuses for load", () => {
    function refusal(status: number, retryAfter?: string): Response {
      const headers = new Headers();
      if (retryAfter !== undefined) headers.set("retry-after", retryAfter);
      return new Response('{"error":"apigateway"}', { status, headers });
    }

    it("retries once after the delay Sentry asks for, and returns the issues", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(refusal(429, "3"))
        .mockResolvedValueOnce(
          jsonResponse([
            { id: "1", title: "a", culprit: "", level: "error", permalink: "" },
          ]),
        );
      vi.stubGlobal("fetch", fetchMock);
      const sleep = vi.fn(async (_ms: number) => {});

      const { getIssuesNeedingReview } = await import("./issues");
      const issues = await getIssuesNeedingReview({ sleep });

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(sleep).toHaveBeenCalledExactlyOnceWith(3000);
      expect(issues.map((i) => i.id)).toEqual(["1"]);
    });

    it("retries a server error the same way", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(refusal(503))
        .mockResolvedValueOnce(jsonResponse([]));
      vi.stubGlobal("fetch", fetchMock);
      const sleep = vi.fn(async (_ms: number) => {});

      const { getIssuesNeedingReview } = await import("./issues");
      await getIssuesNeedingReview({ sleep });

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(sleep).toHaveBeenCalledOnce();
    });

    it("throws with the status when the retry is refused too, without a third try", async () => {
      const fetchMock = vi.fn(async () => refusal(429, "1"));
      vi.stubGlobal("fetch", fetchMock);
      const sleep = vi.fn(async (_ms: number) => {});

      const { getIssuesNeedingReview } = await import("./issues");
      await expect(getIssuesNeedingReview({ sleep })).rejects.toThrow(/429/);

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("caps a long requested delay so the run still fits its time limit", async () => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValueOnce(refusal(429, "120"))
          .mockResolvedValueOnce(jsonResponse([])),
      );
      const sleep = vi.fn(async (_ms: number) => {});

      const { getIssuesNeedingReview } = await import("./issues");
      await getIssuesNeedingReview({ sleep });

      expect(sleep).toHaveBeenCalledExactlyOnceWith(10_000);
    });

    it("waits a default delay when Sentry names none or names one it cannot read", async () => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValueOnce(refusal(429))
          .mockResolvedValueOnce(jsonResponse([]))
          .mockResolvedValueOnce(refusal(429, "soon"))
          .mockResolvedValueOnce(jsonResponse([])),
      );
      const sleep = vi.fn(async (_ms: number) => {});

      const { getIssuesNeedingReview } = await import("./issues");
      await getIssuesNeedingReview({ sleep });
      await getIssuesNeedingReview({ sleep });

      expect(sleep.mock.calls).toEqual([[2000], [2000]]);
    });

    it("does not retry a refusal that waiting cannot fix", async () => {
      const fetchMock = vi.fn(async () => refusal(401));
      vi.stubGlobal("fetch", fetchMock);
      const sleep = vi.fn(async (_ms: number) => {});

      const { getIssuesNeedingReview } = await import("./issues");
      await expect(getIssuesNeedingReview({ sleep })).rejects.toThrow(/401/);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
    });
  });

  it("throws if SENTRY_AUTH_TOKEN is missing", async () => {
    delete process.env.SENTRY_AUTH_TOKEN;
    const { getIssuesNeedingReview } = await import("./issues");
    await expect(getIssuesNeedingReview()).rejects.toThrow(/SENTRY_AUTH_TOKEN/);
  });
});
