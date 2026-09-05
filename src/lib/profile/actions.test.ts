// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  const state = {
    // Queue of .single() results, consumed in call order:
    // 1. current nurse_profiles row, 2. fresh users row, 3. completeness row
    singles: [] as unknown[],
    // #847. The tier read fell back to FREE on a failure, which is the
    // STRICTER schema, so a Featured nurse's own bio and photos were rejected
    // as over a limit they do not have. And softDeleteAccount wrote is_deleted
    // unchecked, so a failed write signed somebody out believing they were
    // gone while their profile stayed public.
    singleError: null as { message: string } | null,
    updateError: null as { message: string } | null,
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
          updatingUsers
            ? Promise.resolve({ data: null, error: state.updateError })
            : b;
        b.update = (payload: Record<string, unknown>) => {
          if (table === "nurse_profiles") calls.profileUpdates.push(payload);
          if (table === "users") updatingUsers = true;
          return b;
        };
        b.single = () =>
          Promise.resolve(
            state.singleError
              ? { data: null, error: state.singleError }
              : { data: state.singles.shift() ?? null, error: null },
          );
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
vi.mock("./completeness", async (importOriginal) => ({
  // Only the scoring is stubbed. The column list stays real, so a field added
  // to the score without being added to that list still breaks here rather
  // than being silently absent from what these callers read.
  ...(await importOriginal<typeof import("./completeness")>()),
  calculateCompleteness: () => ({ score: 50 }),
}));
vi.mock("./upsell", () => ({
  shouldShowFeaturedUpsell: () => false,
  markUpsellShown: vi.fn(),
}));

import {
  updateNurseProfile,
  saveOnboardingStep,
  softDeleteAccount,
  deletePhoto,
} from "./actions";

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
  // Non-empty since #905: fullProfileSchema requires one of each, so an empty
  // list here would bounce the save off validation before the code under test.
  skills: ["medication_management"],
  availability_commitment: ["part_time"],
  time_slots: ["weekdays"],
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
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.calls.profileUpdates = [];
  h.state.singleError = null;
  h.state.updateError = null;
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

// #934. Both writers used to store the list exactly as it was submitted, so
// normalising in the form or in the schema would not have reached the
// database: the actions validate with the schema and then write the RAW
// input. These assert on the payload that actually goes to nurse_profiles.
describe("the spelling of a language that reaches the database", () => {
  it("is title cased on the profile edit form's save", async () => {
    seedSingles("verified");
    const res = await updateNurseProfile({
      ...editData,
      languages: ["english", "haitian creole"],
    });
    expect(res.success).toBeTruthy();
    expect(h.calls.profileUpdates[0]).toMatchObject({
      languages: ["English", "Haitian Creole"],
    });
  });

  it("is title cased on the onboarding wizard's step 1 save", async () => {
    seedSingles("pending");
    const res = await saveOnboardingStep(1, {
      first_name: "Test",
      last_name: "Nurse",
      gender: "female",
      years_experience: 5,
      languages: ["English", "haitian creole"],
    });
    expect(res.success).toBeTruthy();
    expect(h.calls.profileUpdates[0]).toMatchObject({
      languages: ["English", "Haitian Creole"],
    });
  });

  it("stores one entry when two spellings mean one language", async () => {
    seedSingles("verified");
    const res = await updateNurseProfile({
      ...editData,
      languages: ["Haitian creole", "haitian Creole"],
    });
    expect(res.success).toBeTruthy();
    expect(h.calls.profileUpdates[0]).toMatchObject({
      languages: ["Haitian Creole"],
    });
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

describe("deletePhoto", () => {
  // A photo is worth 15 points, the largest single weight in the score, and
  // search ranks on the STORED score while the nurse's own dashboard computes
  // it live. Without recomputing here, a nurse who removes her last photo
  // keeps credit for it in search until the next time she saves the main
  // form, which may be never, and the two screens disagree about her (#727).
  beforeEach(() => {
    h.state.singles = [];
    h.calls.profileUpdates.length = 0;
  });

  it("writes a freshly computed score alongside the photo change", async () => {
    h.state.singles = [
      {
        photos: ["a.jpg", "b.jpg"],
        bio: "A bio",
        skills: [],
        care_philosophy: null,
        availability_commitment: [],
        time_slots: [],
        rate_min: null,
        rate_max: null,
        has_transportation: false,
        covid_vaccinated: null,
        travel_radius_miles: null,
      },
    ];

    await deletePhoto("a.jpg");

    expect(h.calls.profileUpdates).toHaveLength(1);
    expect(h.calls.profileUpdates[0]).toMatchObject({
      photos: ["b.jpg"],
      has_photo: true,
      profile_completeness: 50,
    });
  });

  it("records that the last photo is gone in the same write", async () => {
    h.state.singles = [
      {
        photos: ["only.jpg"],
        bio: null,
        skills: [],
        care_philosophy: null,
        availability_commitment: [],
        time_slots: [],
        rate_min: null,
        rate_max: null,
        has_transportation: false,
        covid_vaccinated: null,
        travel_radius_miles: null,
      },
    ];

    await deletePhoto("only.jpg");

    // One write, not two: a second round trip would leave a window where the
    // photo is gone and the score still counts it.
    expect(h.calls.profileUpdates).toHaveLength(1);
    expect(h.calls.profileUpdates[0]).toMatchObject({
      photos: [],
      has_photo: false,
      profile_completeness: 50,
    });
  });
});

describe("saving where her face is", () => {
  // The card crops her photo to a circle, so the point she chose has to reach
  // the database or the picker is a control that does nothing (#768).
  beforeEach(() => {
    h.state.singles = [];
    h.calls.profileUpdates.length = 0;
  });

  it("persists the point with the bio and photos step", async () => {
    await saveOnboardingStep(4, {
      bio: "Seven years on overnight shifts.",
      photos: ["a.jpg"],
      photo_focal_x: 30,
      photo_focal_y: 70,
    });

    expect(h.calls.profileUpdates).toContainEqual(
      expect.objectContaining({ photo_focal_x: 30, photo_focal_y: 70 }),
    );
  });
});

// #847 / #990. A `"use server"` module returns rather than throws, because a
// throwing server action reaches the client as a redacted digest. The one
// deliberate exception is softDeleteAccount, whose caller in SettingsForm
// records the opposite decision in its own comment: it redirects on success,
// so a genuine failure has to throw for Sentry to see it, and swallowing that
// into a "done" state would be the worse bug.
describe("when a read or write the profile path depends on fails", () => {
  it("does not apply the free tier limits to a nurse whose tier it could not read", async () => {
    // FREE is the STRICTER schema, so falling back to it rejects a Featured
    // nurse's own care types as over a limit they do not have. Step 2 is where
    // the tier is read.
    h.state.singleError = { message: "connection reset" };

    const res = await saveOnboardingStep(2, {
      credential: "rn",
      license_number: "12345",
      care_types: ["elderly"],
      primary_care_type: null,
    });

    expect(res.error).toMatch(/try again/i);
    expect(h.calls.profileUpdates).toHaveLength(0);
  });

  it("still validates against the free limits when the tier genuinely reads free", async () => {
    // The positive control: a real free nurse must still be held to the free
    // schema, or the refusal above would have removed the limit entirely.
    h.state.singles = [{ tier: "free" }];

    const res = await saveOnboardingStep(2, {
      credential: "rn",
      license_number: "",
      care_types: ["elderly"],
      primary_care_type: null,
    });

    expect(res.error).toBeTruthy();
    expect(h.calls.profileUpdates).toHaveLength(0);
  });

  it("refuses to report an account deleted when the write did not land", async () => {
    // Stripe is cancelled before this write and the person is signed out after
    // it, so a silent failure leaves somebody believing they are gone while
    // their profile stays public and their subscription stays cancelled.
    h.state.updateError = { message: "permission denied" };

    await expect(softDeleteAccount()).rejects.toThrow(
      /the account deletion this person asked for could not be written/,
    );
  });
});

// #963. Both writers validated with the zod schema and then wrote the RAW
// submitted object, so every transform, trim and default the schema applies
// existed only in the type system. These assert on the payload that reaches
// nurse_profiles, which is the only place the difference shows.
describe("the values that reach the database are the validated ones", () => {
  beforeEach(() => {
    h.state.singles = [];
    h.calls.profileUpdates.length = 0;
  });

  it("stores the bio the schema trimmed, not the one submitted", async () => {
    const res = await saveOnboardingStep(4, {
      bio: "   Seven years on overnight shifts.   ",
      photos: ["a.jpg"],
      photo_focal_x: 30,
      photo_focal_y: 70,
    });

    expect(res.success).toBeTruthy();
    expect(h.calls.profileUpdates[0]).toMatchObject({
      bio: "Seven years on overnight shifts.",
    });
  });

  it("stores the middle of the photo when no focal point was sent", async () => {
    // focalCoordinate defaults to 50. Writing the raw input stores undefined,
    // which PostgREST drops, so the column keeps whatever it held before.
    const res = await saveOnboardingStep(4, {
      bio: "Seven years on overnight shifts.",
      photos: ["a.jpg"],
    });

    expect(res.success).toBeTruthy();
    expect(h.calls.profileUpdates[0]).toMatchObject({
      photo_focal_x: 50,
      photo_focal_y: 50,
    });
  });

  it("stores the step 3 defaults for the fields a form need not send", async () => {
    const res = await saveOnboardingStep(3, {
      skills: ["medication_management"],
      availability_commitment: ["part_time"],
      time_slots: ["weekdays"],
      rate_min: null,
      rate_max: null,
    });

    expect(res.success).toBeTruthy();
    expect(h.calls.profileUpdates[0]).toMatchObject({
      has_transportation: false,
      covid_vaccinated: null,
      care_philosophy: null,
      additional_certs: [],
    });
  });

  it("stores the trimmed bio on the profile edit form's save too", async () => {
    seedSingles("verified");
    const res = await updateNurseProfile({
      ...editData,
      bio: "  A bio long enough to pass.  ",
    });

    expect(res.success).toBeTruthy();
    expect(h.calls.profileUpdates[0]).toMatchObject({
      bio: "A bio long enough to pass.",
    });
  });
});
