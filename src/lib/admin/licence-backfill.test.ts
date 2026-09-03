// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  needsLicenceNumber,
  wasSentBackByThisBackfill,
  LICENCE_NEEDED_REASON,
  type LicenceBacklogRow,
} from "./licence-backfill";

/**
 * #912, the backlog half. This selects real nurses to take a badge away from
 * and email, so the predicate is worth more than the script that runs it.
 */
function row(overrides: Partial<LicenceBacklogRow> = {}): LicenceBacklogRow {
  return {
    user_id: "nurse-1",
    credential: "hha",
    license_number: null,
    verification_status: "verified",
    is_hidden: false,
    users: { is_deleted: false, is_suspended: false },
    ...overrides,
  };
}

describe("who gets sent back", () => {
  it("a verified HHA with no licence number", () => {
    expect(needsLicenceNumber(row())).toBe(true);
  });

  it("and one whose licence number is an empty string", () => {
    // A stored "" is not a licence number, and it is the shape a form save
    // leaves behind rather than null.
    expect(needsLicenceNumber(row({ license_number: "" }))).toBe(true);
  });
});

describe("who is left alone", () => {
  it.each([
    ["she has a licence number", { license_number: "HHA-99" }],
    ["she is an RN, who needs no licence number", { credential: "rn" }],
    ["she is not verified", { verification_status: "pending" }],
    ["she was already rejected", { verification_status: "rejected" }],
    ["her profile is hidden", { is_hidden: true }],
  ])("%s", (_what, overrides) => {
    expect(needsLicenceNumber(row(overrides))).toBe(false);
  });

  it.each([
    ["her account is deleted", { is_deleted: true, is_suspended: false }],
    ["her account is suspended", { is_deleted: false, is_suspended: true }],
  ])("%s, so nothing is taken away and no email is sent", (_what, users) => {
    expect(needsLicenceNumber(row({ users }))).toBe(false);
  });

  it("a row with no owner at all", () => {
    // An inner join should make this impossible. If it ever happens, doing
    // nothing is the safe answer, since there is nobody to tell.
    expect(needsLicenceNumber(row({ users: null }))).toBe(false);
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
    expect(LICENCE_NEEDED_REASON).not.toMatch(/could not verify|expired|invalid/i);
  });
});
