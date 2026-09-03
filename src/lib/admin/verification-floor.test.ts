// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * #912. Verification could be granted to a profile with nothing in it. The
 * approve path guarded only the current status, never whether the nurse had
 * provided anything, so the badge meant "an admin pressed a button" rather
 * than "we checked her credentials".
 *
 * Measured against production on 2026-09-03: 121 verified profiles, 32 of them
 * HHAs, and 29 of those HHAs have no licence number at all. Onboarding
 * requires a licence number for HHA and only for HHA, so those 29 are missing
 * the one field the check is supposed to rest on.
 *
 * Dan's call: the approve button refuses below the floor and says what is
 * missing, with no override. The floor is the wizard's own definition of a
 * finished profile, so there is one definition rather than a second one
 * written here (#905 closed the same gap between the wizard and the
 * dashboard).
 */
const h = vi.hoisted(() => {
  const state = {
    profile: {} as Record<string, unknown> | null,
  };
  const calls = {
    updates: [] as unknown[],
    adminActions: [] as unknown[],
    approvedEmail: [] as unknown[],
  };
  return { state, calls };
});

vi.mock("@/lib/auth/helpers", () => ({
  requireAdmin: async () => ({ id: "admin-1" }),
}));

vi.mock("next/server", () => ({ after: (fn: () => unknown) => fn() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

vi.mock("@/lib/db/guarded-status-update", () => ({
  guardedStatusUpdate: async (_c: unknown, args: unknown) => {
    h.calls.updates.push(args);
    return { outcome: "updated" };
  },
}));

vi.mock("@/lib/email/send", () => ({
  sendVerificationApprovedEmail: async (args: unknown) => {
    h.calls.approvedEmail.push(args);
  },
  sendVerificationRejectedEmail: async () => {},
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      if (table === "admin_actions") {
        return {
          insert: async (row: unknown) => {
            h.calls.adminActions.push(row);
            return { error: null };
          },
        };
      }
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.eq = () => b;
      b.maybeSingle = async () => ({ data: h.state.profile, error: null });
      return b;
    },
  }),
}));

import { approveVerification } from "./verification-actions";

// The action validates its input as a uuid before it reads anything.
const NURSE_ID = "11111111-2222-4333-8444-555555555555";

/** Everything getOnboardingStatus requires, so the floor is met. */
function completeProfile(overrides: Record<string, unknown> = {}) {
  return {
    user_id: NURSE_ID,
    slug: "jane-rn",
    verification_status: "pending",
    years_experience: 8,
    languages: ["English"],
    credential: "rn",
    license_number: "RN-1",
    care_types: ["elderly"],
    skills: ["medication_management"],
    availability_commitment: ["part_time"],
    time_slots: ["weekdays"],
    bio: "Eight years on a ward.",
    photos: ["photo-1.jpg"],
    travel_radius_miles: 10,
    users: {
      first_name: "Jane",
      last_name: "Doe",
      email: "jane@example.com",
      zip_code: "11201",
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.calls.updates.length = 0;
  h.calls.adminActions.length = 0;
  h.calls.approvedEmail.length = 0;
  h.state.profile = completeProfile();
});

describe("approving a finished profile", () => {
  it("still works", async () => {
    const result = await approveVerification({ user_id: NURSE_ID });

    expect(result.success).toBe(true);
    expect(h.calls.updates).toHaveLength(1);
    expect(h.calls.approvedEmail).toHaveLength(1);
  });
});

describe("approving an unfinished profile", () => {
  const CASES: Array<[string, Record<string, unknown>]> = [
    [
      "an HHA with no licence number",
      { credential: "hha", license_number: null },
    ],
    ["no care types", { care_types: [] }],
    ["no bio", { bio: null }],
    ["no photos", { photos: [] }],
    ["no skills", { skills: [] }],
  ];

  it.each(CASES)("refuses %s", async (_what, overrides) => {
    h.state.profile = completeProfile(overrides);

    const result = await approveVerification({ user_id: NURSE_ID });

    expect(result.success).toBe(false);
    expect(result.error).toBe("incomplete");
  });

  it.each(CASES)("writes nothing at all for %s", async (_what, overrides) => {
    h.state.profile = completeProfile(overrides);

    await approveVerification({ user_id: NURSE_ID });

    // The email is the half that cannot be taken back: it tells a real nurse
    // she has been approved. The audit row and the status write matter too,
    // since either one leaves the queue disagreeing with the profile.
    expect(h.calls.approvedEmail).toEqual([]);
    expect(h.calls.updates).toEqual([]);
    expect(h.calls.adminActions).toEqual([]);
  });

  it("names the step the admin has to wait for", async () => {
    h.state.profile = completeProfile({
      credential: "hha",
      license_number: null,
    });

    const result = await approveVerification({ user_id: NURSE_ID });

    // "Please try again" is what the queue says for every other failure, and
    // trying again cannot fix this one: only the nurse can. So the refusal
    // carries the step, and the admin's toast says it.
    expect(result.missingStep).toBe("Credentials");
  });
});
