// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resubmissionPatch } from "./resubmission";

describe("resubmissionPatch", () => {
  it("returns a rejected profile to the review queue", () => {
    expect(resubmissionPatch("rejected")).toEqual({
      verification_status: "pending",
    });
  });

  it("keeps the rejection reason, so the queue can badge the resubmission", () => {
    expect(resubmissionPatch("rejected")).not.toHaveProperty(
      "verification_rejected_reason",
    );
  });

  it.each(["pending", "verified", null, undefined])(
    "leaves %s alone",
    (status) => {
      expect(resubmissionPatch(status)).toEqual({});
    },
  );
});

// Both paths that can finish a profile have to do this, and they are not
// interchangeable: the edit form is unreachable until onboarding is complete,
// so an unfinished profile is fixed in the wizard. A nurse asked for her
// licence number (#912) whose profile is unfinished fixes it there, and if
// only the edit path re-queued her she would never be reviewed again.
describe("who has to use it", () => {
  it.each([
    ["updateNurseProfile, the edit form"],
    ["completeOnboarding, the end of the wizard"],
  ])("%s", () => {
    const source = readFileSync("src/lib/profile/actions.ts", "utf8");
    expect(source).toContain("resubmissionPatch(");
    // Two call sites, not one. A single one would satisfy a naive check while
    // leaving the other path writing its own rule or nothing at all.
    const callSites = source.split("resubmissionPatch(").length - 1;
    expect(callSites).toBeGreaterThanOrEqual(2);
  });
});
