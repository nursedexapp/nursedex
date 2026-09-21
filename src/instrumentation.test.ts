// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureRequestError: vi.fn() }));

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
});

describe("the Next.js request error hook", () => {
  it("sends nothing to Sentry for a forged action POST", () => {
    onRequestError(actionNotFound(), request(forgedUpload), context);

    expect(captureRequestError).not.toHaveBeenCalled();
  });

  it("sends nothing to Sentry when the Origin claims this site either", () => {
    onRequestError(
      actionNotFound(),
      request({ ...forgedUpload, origin: "https://nursedex.com" }),
      context,
    );

    expect(captureRequestError).not.toHaveBeenCalled();
  });

  it("passes every other error straight through, with its request and context", () => {
    const other = new Error("Supabase read failed");
    const req = request(forgedUpload);

    onRequestError(other, req, context);

    expect(captureRequestError).toHaveBeenCalledWith(other, req, context);
  });
});
