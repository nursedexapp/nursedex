// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ captureMessage: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureMessage: h.captureMessage }));

import { POST } from "./route";

function req(body: unknown, throwOnJson = false) {
  return {
    json: throwOnJson
      ? () => Promise.reject(new Error("bad json"))
      : () => Promise.resolve(body),
  } as unknown as Request;
}

const realViolation = {
  "csp-report": {
    "violated-directive": "script-src",
    "blocked-uri": "https://evil.example.com/tracker.js",
    "document-uri": "https://nursedex.com/nurses",
    "source-file": "https://nursedex.com/nurses",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/csp-report", () => {
  it("records a real violation in Sentry at warning level with a csp tag", async () => {
    const res = await POST(req(realViolation) as never);
    expect(res.status).toBe(204);
    expect(h.captureMessage).toHaveBeenCalledTimes(1);
    const [message, options] = h.captureMessage.mock.calls[0];
    expect(message).toMatch(/script-src/);
    expect(options.level).toBe("warning");
    expect(options.tags.action).toBe("csp");
    expect(options.fingerprint).toContain("csp");
  });

  it("ignores an extension-injected violation but still returns 204", async () => {
    const res = await POST(
      req({
        "csp-report": {
          "violated-directive": "script-src",
          "blocked-uri": "chrome-extension://abc/inject.js",
          "document-uri": "https://nursedex.com/nurses",
          "source-file": "chrome-extension://abc/inject.js",
        },
      }) as never,
    );
    expect(res.status).toBe(204);
    expect(h.captureMessage).not.toHaveBeenCalled();
  });

  it("records each real violation in a report-to batch", async () => {
    const batch = [
      {
        type: "csp-violation",
        body: {
          violatedDirective: "frame-src",
          blockedURL: "https://widget.example.com/embed",
          documentURL: "https://nursedex.com/x",
          sourceFile: "https://nursedex.com/x",
        },
      },
    ];
    const res = await POST(req(batch) as never);
    expect(res.status).toBe(204);
    expect(h.captureMessage).toHaveBeenCalledTimes(1);
  });

  // The browser fires these unauthenticated; a malformed or hostile body must
  // never 500 (which would look like an outage), just be a quiet no-op.
  it("returns 204 and records nothing for an unparseable body", async () => {
    const res = await POST(req(null, true) as never);
    expect(res.status).toBe(204);
    expect(h.captureMessage).not.toHaveBeenCalled();
  });

  it("returns 204 and records nothing for an unrecognized body", async () => {
    const res = await POST(req({ nonsense: true }) as never);
    expect(res.status).toBe(204);
    expect(h.captureMessage).not.toHaveBeenCalled();
  });
});
