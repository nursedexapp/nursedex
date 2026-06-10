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
  function client() {
    return {
      from(table: string) {
        const b: Record<string, unknown> = {};
        b.select = () => b;
        b.eq = () => b;
        b.update = (payload: Record<string, unknown>) => {
          if (table === "nurse_profiles") calls.profileUpdates.push(payload);
          return b;
        };
        b.single = () =>
          Promise.resolve({ data: state.singles.shift() ?? null, error: null });
        return b;
      },
    };
  }
  return { state, calls, client };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => fn() }));
vi.mock("@/lib/email/send", () => ({ sendProfileSetupEmail: vi.fn() }));
vi.mock("@/lib/auth/helpers", () => ({
  requireAuth: async () => ({ id: "nurse-1" }),
  requireRole: async () => ({ id: "nurse-1" }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => h.client(),
}));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => h.client(),
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

import { updateNurseProfile } from "./actions";

// Names and credential match the existing slug so the edit stays on the
// simple update path (no slug regeneration, no credential change).
const editData = {
  first_name: "Test",
  last_name: "Nurse",
  contact_phone: "",
  zip_code: "10001",
  communication_preference: "email",
  credential: "cna",
  license_number: "12345",
  care_types: ["companionship"],
  gender: "female",
  years_experience: 3,
  languages: ["english"],
  bio: "A bio long enough to pass.",
  has_transportation: true,
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
