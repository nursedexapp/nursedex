// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  const state = {
    // Queue of .single() results, consumed in call order:
    // 1. current nurse_profiles row, 2. fresh users row, 3. completeness row
    singles: [] as unknown[],
  };
  const calls = {
    profileUpdates: [] as Record<string, unknown>[],
  };
  const cancelActiveStripeSubscriptions = vi.fn(async () => {});
  function client() {
    return {
      from(table: string) {
        const b: Record<string, unknown> = {};
        let updatingUsers = false;
        b.select = () => b;
        b.eq = () =>
          updatingUsers ? Promise.resolve({ error: null }) : b;
        b.update = (payload: Record<string, unknown>) => {
          if (table === "nurse_profiles") calls.profileUpdates.push(payload);
          if (table === "users") updatingUsers = true;
          return b;
        };
        b.single = () =>
          Promise.resolve({ data: state.singles.shift() ?? null, error: null });
        return b;
      },
      auth: { signOut: vi.fn() },
    };
  }
  return { state, calls, client, cancelActiveStripeSubscriptions };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => fn() }));
vi.mock("@/lib/email/send", () => ({ sendProfileSetupEmail: vi.fn() }));
vi.mock("@/lib/auth/helpers", () => ({
  // Happy path only: this stubs the guard so the logic PAST it can be
  // exercised. The refused direction (wrong role / not signed in, and no
  // write) is covered for real in src/lib/admin/authz-boundary.test.ts,
  // which runs the actual guard.
  // eslint-disable-next-line local/no-mocked-auth-guard -- see above
  requireAuth: async () => ({ id: "nurse-1" }),
  // Happy path only: this stubs the guard so the logic PAST it can be
  // exercised. The refused direction (wrong role / not signed in, and no
  // write) is covered for real in src/lib/admin/authz-boundary.test.ts,
  // which runs the actual guard.
  // eslint-disable-next-line local/no-mocked-auth-guard -- see above
  requireRole: async () => ({ id: "nurse-1" }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => h.client(),
}));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => h.client(),
}));
vi.mock("@/lib/stripe/cancel-subscriptions", () => ({
  cancelActiveStripeSubscriptions: h.cancelActiveStripeSubscriptions,
}));
vi.mock("./photos", () => ({
  getSignedUploadUrl: vi.fn(),
  validateUploadedPhoto: vi.fn(),
  removePhoto: vi.fn(),
}));
vi.mock("./slug", () => ({
  claimSlug: vi.fn(),
  saveSlugRedirect: vi.fn(),
}));
vi.mock("./completeness", () => ({
  calculateCompleteness: () => ({ score: 50 }),
}));
vi.mock("./upsell", () => ({
  shouldShowFeaturedUpsell: () => false,
  markUpsellShown: vi.fn(),
}));

import { updateNurseProfile, saveOnboardingStep, softDeleteAccount } from "./actions";

// A complete, schema-valid payload (matches what the edit form sends after
// fullProfileSchema validation). Names and credential match the existing slug
// so the edit stays on the simple update path (no slug regen, no credential
// change).
const editData = {
  first_name: "Test",
  last_name: "Nurse",
  gender: "female",
  years_experience: 3,
  languages: ["english"],
  credential: "cna",
  license_number: "12345",
  care_types: ["elderly"],
  primary_care_type: null,
  skills: [],
  availability_commitment: [],
  time_slots: [],
  rate_min: null,
  rate_max: null,
  has_transportation: true,
  covid_vaccinated: null,
  care_philosophy: null,
  additional_certs: [],
  bio: "A bio long enough to pass.",
  photos: ["photos/nurse-1/a.jpg"],
  contact_email: "test@example.com",
  contact_phone: "",
  communication_preference: "email",
  zip_code: "10001",
  travel_radius_miles: 25,
};

function seedSingles(verificationStatus: string) {
  h.state.singles = [
    {
      slug: "test-nurse-cna",
      credential: "cna",
      verification_status: verificationStatus,
    },
    { first_name: "Test", last_name: "Nurse" },
    { tier: "free", verification_status: verificationStatus },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  h.calls.profileUpdates = [];
});

describe("updateNurseProfile resubmission", () => {
  it("returns a rejected profile to the review queue on save", async () => {
    seedSingles("rejected");
    const res = await updateNurseProfile(editData);
    expect(res.success).toBeTruthy();
    const fieldUpdate = h.calls.profileUpdates[0];
    expect(fieldUpdate).toMatchObject({ verification_status: "pending" });
    // The rejection reason is preserved so the admin queue can flag
    // the profile as a resubmission.
    expect(fieldUpdate).not.toHaveProperty("verification_rejected_reason");
  });

  it("leaves verification_status alone when not rejected", async () => {
    for (const status of ["pending", "verified"]) {
      h.calls.profileUpdates = [];
      seedSingles(status);
      const res = await updateNurseProfile(editData);
      expect(res.success).toBeTruthy();
      expect(h.calls.profileUpdates[0]).not.toHaveProperty(
        "verification_status",
      );
    }
  });
});

describe("updateNurseProfile server-side validation", () => {
  it("rejects a non-HHA credential with no license number and writes nothing", async () => {
    seedSingles("verified");
    const res = await updateNurseProfile({
      ...editData,
      credential: "rn",
      license_number: "",
    });
    expect(res.error).toBeTruthy();
    expect(res.success).toBeFalsy();
    expect(h.calls.profileUpdates).toHaveLength(0);
  });
});

describe("saveOnboardingStep server-side validation (step 2 credentials)", () => {
  const step2 = {
    credential: "rn",
    license_number: "12345",
    care_types: ["elderly"],
    primary_care_type: null,
  };

  it("rejects a non-HHA credential with no license number and writes nothing", async () => {
    // One single for the getNurseTier lookup before validation runs.
    h.state.singles = [{ tier: "free" }];
    const res = await saveOnboardingStep(2, {
      ...step2,
      credential: "rn",
      license_number: "",
    });
    expect(res.error).toBeTruthy();
    expect(h.calls.profileUpdates).toHaveLength(0);
  });

  it("accepts an HHA with no license number and stores null", async () => {
    h.state.singles = [{ tier: "free" }];
    const res = await saveOnboardingStep(2, {
      ...step2,
      credential: "hha",
      license_number: "",
    });
    expect(res.success).toBeTruthy();
    expect(h.calls.profileUpdates[0]).toMatchObject({ license_number: null });
  });
});

describe("softDeleteAccount", () => {
  it("cancels active Stripe subscriptions before marking the account deleted", async () => {
    await softDeleteAccount();

    expect(h.cancelActiveStripeSubscriptions).toHaveBeenCalledWith(
      expect.anything(),
      "nurse-1",
    );
  });
});
