// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ captureMessage: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureMessage: h.captureMessage }));

import { ABSORBED_RETRY_TAG, reportAbsorbedRetry } from "./absorbed-retry";

beforeEach(() => {
  h.captureMessage.mockReset();
});

describe("reporting a refusal that one retry absorbed (#1321)", () => {
  it("counts it in Sentry as a warning, with the caller's own tags beside the shared one", () => {
    reportAbsorbedRetry("Storage refused with 544, retrying once", {
      db_operation: "a signed URL for a nurse's photo",
    });

    expect(h.captureMessage).toHaveBeenCalledExactlyOnceWith(
      "Storage refused with 544, retrying once",
      {
        level: "warning",
        tags: {
          db_operation: "a signed URL for a nurse's photo",
          [ABSORBED_RETRY_TAG.key]: ABSORBED_RETRY_TAG.value,
        },
      },
    );
  });

  // The relay excludes by TAG, never by level (src/lib/sentry/issues.ts): an
  // issue that has ever held one error answers the level filter for ever. So
  // this tag is what stands between a blip the visitor never saw and a post
  // in the alerts channel. Read it from the relay's own query.
  it("uses the tag the Slack relay leaves out", async () => {
    vi.stubEnv("SENTRY_AUTH_TOKEN", "unused");
    vi.doMock("server-only", () => ({}));
    const { NEEDS_REVIEW_QUERY } = await import("./issues");
    expect(NEEDS_REVIEW_QUERY.split(" ")).toContain(
      `!${ABSORBED_RETRY_TAG.key}:${ABSORBED_RETRY_TAG.value}`,
    );
  });
});
