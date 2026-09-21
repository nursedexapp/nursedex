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
      "is:for_review level:[error,fatal] !action:cron !action:stripe-webhook " +
        "!action:unattributable-post",
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

  it("throws if SENTRY_AUTH_TOKEN is missing", async () => {
    delete process.env.SENTRY_AUTH_TOKEN;
    const { getIssuesNeedingReview } = await import("./issues");
    await expect(getIssuesNeedingReview()).rejects.toThrow(/SENTRY_AUTH_TOKEN/);
  });
});
