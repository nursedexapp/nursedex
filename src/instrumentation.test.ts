// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const scope = { setLevel: vi.fn() };
vi.mock("@sentry/nextjs", () => ({
  captureRequestError: vi.fn(),
  // Real in the SDK, so it must exist here or the level branch throws. What
  // the level does to the finished event is asserted against the real SDK in
  // src/instrumentation-level.test.ts; a mocked scope can only show the call.
  withScope: vi.fn((run: (s: typeof scope) => void) => run(scope)),
}));

import * as Sentry from "@sentry/nextjs";
import { onRequestError } from "./instrumentation";

/**
 * The filter decided in src/lib/sentry/report-request-error.ts is worth nothing
 * until this hook consults it (L3). Next hands every server error to
 * `onRequestError`, and the seven forged POSTs of NURSEDEX-SITE-10 carried the
 * mechanism tag `auto.function.nextjs.on_request_error`, so this is the seam
 * they arrived through.
 */
const captureRequestError = vi.mocked(Sentry.captureRequestError);

const request = (headers: Record<string, string>) => ({
  path: "/",
  method: "POST",
  headers,
});

const context = {
  routerKind: "App Router" as const,
  routePath: "/(public)/page",
  routeType: "action" as const,
  revalidateReason: undefined,
};

const forgedUpload = {
  host: "nursedex.com",
  "x-forwarded-proto": "https",
  "content-type": "multipart/form-data; boundary=----WebKitFormBoundary898d",
};

const actionNotFound = () =>
  new Error(
    "Failed to find Server Action. This request might be from an older or newer deployment.\n" +
      "Read more: https://nextjs.org/docs/messages/failed-to-find-server-action",
  );

beforeEach(() => {
  captureRequestError.mockClear();
  scope.setLevel.mockClear();
});

describe("the Next.js request error hook", () => {
  it("sends nothing to Sentry for a forged action POST", () => {
    onRequestError(actionNotFound(), request(forgedUpload), context);

    expect(captureRequestError).not.toHaveBeenCalled();
  });

  it("sends the renamed error to Sentry when the Origin claims this site", () => {
    const original = actionNotFound();

    onRequestError(
      original,
      request({ ...forgedUpload, origin: "https://nursedex.com" }),
      context,
    );

    expect(captureRequestError).toHaveBeenCalledTimes(1);
    const [reported] = captureRequestError.mock.calls[0];
    expect(reported).toBeInstanceOf(Error);
    expect((reported as Error).cause).toBe(original);
  });

  it("lowers that one to warning, so it cannot reach the Slack relay", () => {
    onRequestError(
      actionNotFound(),
      request({ ...forgedUpload, origin: "https://nursedex.com" }),
      context,
    );

    expect(scope.setLevel).toHaveBeenCalledWith("warning");
  });

  it("does not lower an ordinary crash, which must still reach Slack", () => {
    onRequestError(
      new Error("Supabase read failed"),
      request(forgedUpload),
      context,
    );

    expect(scope.setLevel).not.toHaveBeenCalled();
  });

  it("passes every other error straight through, with its request and context", () => {
    const other = new Error("Supabase read failed");
    const req = request(forgedUpload);

    onRequestError(other, req, context);

    expect(captureRequestError).toHaveBeenCalledWith(other, req, context);
  });
});
