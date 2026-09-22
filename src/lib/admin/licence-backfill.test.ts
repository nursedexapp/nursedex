// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  wasSentBackByThisBackfill,
  LICENCE_NEEDED_REASON,
} from "./licence-backfill";

// The send back mode asked 25 aides for a licence number HHAs do not hold
// (2026-09-22). It is deleted, so nothing in the script can take a badge away.
describe("the script", () => {
  it("can only restore, never send anybody back", () => {
    const source = readFileSync("scripts/licence-number-backfill.ts", "utf8");
    expect(source).not.toMatch(/verification_status:\s*"rejected"/);
    expect(source).not.toMatch(/email_log|\/api\/email\//);
    expect(source).toMatch(/verification_status:\s*"verified"/);
  });
});

describe("what the reversal may touch", () => {
  it("a nurse this backfill sent back", () => {
    expect(
      wasSentBackByThisBackfill({
        verification_status: "rejected",
        verification_rejected_reason: LICENCE_NEEDED_REASON,
      }),
    ).toBe(true);
  });

  it("never a nurse an admin rejected for a real reason", () => {
    // The undo has to be able to run months later, when the queue has other
    // rejections in it. The reason string is what tells them apart.
    expect(
      wasSentBackByThisBackfill({
        verification_status: "rejected",
        verification_rejected_reason: "Licence expired in 2024",
      }),
    ).toBe(false);
  });

  it("never a nurse who has since been verified again", () => {
    expect(
      wasSentBackByThisBackfill({
        verification_status: "verified",
        verification_rejected_reason: LICENCE_NEEDED_REASON,
      }),
    ).toBe(false);
  });

  it("never a rejection carrying no reason", () => {
    expect(
      wasSentBackByThisBackfill({
        verification_status: "rejected",
        verification_rejected_reason: null,
      }),
    ).toBe(false);
  });
});

describe("the reason she reads", () => {
  it("says what to do rather than what went wrong", () => {
    // It renders on her dashboard under "What to fix", so it is addressed to
    // her. It must not claim we checked a licence, because there was never a
    // number to check.
    expect(LICENCE_NEEDED_REASON).toMatch(/license number/i);
    expect(LICENCE_NEEDED_REASON).toMatch(/add it/i);
    expect(LICENCE_NEEDED_REASON).not.toMatch(
      /could not verify|expired|invalid/i,
    );
  });
});
