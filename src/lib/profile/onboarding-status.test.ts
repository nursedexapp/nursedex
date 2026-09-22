// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  getOnboardingStatus,
  onboardingRedirectPath,
  ONBOARDING_GATED_PAGES,
} from "./onboarding-status";
import { readFileSync } from "node:fs";
import {
  step2Schema,
  step3Schema,
  fullProfileSchema,
} from "@/lib/schemas/profile";
import type { NurseProfile, User } from "@/types/database";
import {
  Skill,
  AvailabilityCommitment,
  TimeSlot,
  CareType,
  Gender,
  Credential,
  NurseTier,
  CommunicationPreference,
} from "@/types/enums";

// #905. Two definitions of a finished profile disagreed, and 24 verified
// nurses were living in the gap: the wizard let them past step 3 with nothing
// filled in, and getOnboardingStatus then treated the same profile as
// unfinished, so /dashboard, /dashboard/edit and /dashboard/preview all sent
// them back into the wizard for good.
//
// Dan's decision (2026-09-03): the gate is right and the wizard is wrong, so
// the step is required. These tests pin the two definitions TO EACH OTHER, so
// a later change to one of them fails here rather than quietly reopening the
// gap.

const STEP_3_FIELDS = [
  "skills",
  "availability_commitment",
  "time_slots",
] as const;

function completeProfile(): NurseProfile {
  return {
    user_id: "nurse-1",
    slug: "jane-doe",
    credential: "rn",
    license_number: "RN-1",
    years_experience: 8,
    languages: ["English"],
    care_types: [CareType.ELDERLY],
    primary_care_type: CareType.ELDERLY,
    skills: [Skill.MEDICATION_MANAGEMENT],
    availability_commitment: [AvailabilityCommitment.PART_TIME],
    time_slots: [TimeSlot.WEEKDAYS],
    rate_min: null,
    rate_max: null,
    has_transportation: false,
    covid_vaccinated: null,
    care_philosophy: null,
    additional_certs: [],
    bio: "Eight years on a hospital ward, now working with families at home.",
    photos: ["photo-1.jpg"],
    has_photo: true,
    travel_radius_miles: 10,
    verification_status: "verified",
  } as unknown as NurseProfile;
}

function completeUser(): User {
  return {
    id: "nurse-1",
    first_name: "Jane",
    last_name: "Doe",
    zip_code: "11201",
  } as unknown as User;
}

/** The step 3 payload the wizard submits for a given profile. */
function step3Payload(profile: NurseProfile) {
  return {
    skills: profile.skills ?? [],
    availability_commitment: profile.availability_commitment ?? [],
    time_slots: profile.time_slots ?? [],
    rate_min: profile.rate_min ?? null,
    rate_max: profile.rate_max ?? null,
    has_transportation: profile.has_transportation ?? false,
    covid_vaccinated: profile.covid_vaccinated ?? null,
    care_philosophy: profile.care_philosophy ?? null,
    additional_certs: profile.additional_certs ?? [],
  };
}

describe("getOnboardingStatus", () => {
  it("calls a fully filled profile complete", () => {
    expect(getOnboardingStatus(completeProfile(), completeUser())).toEqual({
      complete: true,
    });
  });

  it.each(STEP_3_FIELDS)(
    "sends a profile with no %s back to step 3",
    (field) => {
      const profile = { ...completeProfile(), [field]: [] } as NurseProfile;
      expect(getOnboardingStatus(profile, completeUser())).toEqual({
        complete: false,
        nextStep: 3,
      });
    },
  );
});

// The pin. Whatever the wizard accepts for step 3 has to be what the gate
// calls a finished step 3, in both directions. A profile the wizard waves
// through but the gate rejects is the lockout this issue is about; a profile
// the wizard refuses but the gate accepts would strand her the other way, at
// a step she cannot leave.
describe("step 3 has one definition", () => {
  it("accepts through the wizard exactly what the gate calls finished", () => {
    const profile = completeProfile();
    expect(step3Schema.safeParse(step3Payload(profile)).success).toBe(true);
    expect(getOnboardingStatus(profile, completeUser()).complete).toBe(true);
  });

  it.each(STEP_3_FIELDS)("refuses an empty %s at both ends", (field) => {
    const profile = { ...completeProfile(), [field]: [] } as NurseProfile;
    const parsed = step3Schema.safeParse(step3Payload(profile));
    expect(parsed.success).toBe(false);
    const status = getOnboardingStatus(profile, completeUser());
    expect(status).toEqual({ complete: false, nextStep: 3 });
  });

  it.each(STEP_3_FIELDS)(
    "says what is missing rather than failing bare",
    (field) => {
      const profile = { ...completeProfile(), [field]: [] } as NurseProfile;
      const parsed = step3Schema.safeParse(step3Payload(profile));
      if (parsed.success) throw new Error("expected a validation failure");
      const issue = parsed.error.issues.find((i) => i.path[0] === field);
      // She has to be told which control to go and use, so the message names
      // the thing to pick rather than just reporting that the step is invalid.
      expect(issue?.message).toBeTruthy();
      expect(issue?.message.length).toBeGreaterThan(10);
    },
  );

  // The edit form saves through fullProfileSchema rather than step3Schema, so
  // the rule has to hold there too. Without this a nurse could finish
  // onboarding, clear her skills on the edit page, save, and be locked out of
  // the dashboard again by the same gate.
  it.each(STEP_3_FIELDS)(
    "refuses an empty %s on the edit form as well",
    (field) => {
      const full = {
        first_name: "Jane",
        last_name: "Doe",
        gender: Gender.FEMALE,
        years_experience: 8,
        languages: ["English"],
        credential: Credential.RN,
        license_number: "RN-1",
        care_types: [CareType.ELDERLY],
        primary_care_type: null,
        skills: [Skill.MEDICATION_MANAGEMENT],
        availability_commitment: [AvailabilityCommitment.PART_TIME],
        time_slots: [TimeSlot.WEEKDAYS],
        rate_min: null,
        rate_max: null,
        has_transportation: false,
        covid_vaccinated: null,
        care_philosophy: null,
        additional_certs: [],
        bio: "Eight years on a ward, now with families at home.",
        photo_focal_x: 50,
        photo_focal_y: 50,
        photos: ["photo-1.jpg"],
        contact_email: "jane@example.com",
        contact_phone: null,
        communication_preference: CommunicationPreference.EMAIL,
        zip_code: "11201",
        travel_radius_miles: 10,
      };
      const schema = fullProfileSchema(NurseTier.FREE);
      expect(schema.safeParse(full).success).toBe(true);
      expect(schema.safeParse({ ...full, [field]: [] }).success).toBe(false);
    },
  );
});

// The license rule has the same two ends. The wizard exempted HHAs from a
// license number while the gate demanded one of HHAs and nobody else, so every
// unlicensed aide who finished signup was still "unfinished" to the dashboard
// and the approve button (reported 2026-09-22, five aides stuck pending).
describe("the license rule has one definition", () => {
  it.each(Object.values(Credential))(
    "a %s with no license number is treated the same by the wizard and the gate",
    (credential) => {
      const profile = {
        ...completeProfile(),
        credential,
        license_number: null,
      } as unknown as NurseProfile;
      const accepted = step2Schema(NurseTier.FREE).safeParse({
        credential,
        license_number: "",
        care_types: profile.care_types,
        primary_care_type: null,
      }).success;
      const status = getOnboardingStatus(profile, completeUser());
      expect(status.complete).toBe(accepted);
    },
  );

  it.each([Credential.HHA, Credential.CNA])(
    "calls a %s with no license number finished",
    (credential) => {
      const profile = {
        ...completeProfile(),
        credential,
        license_number: null,
      } as unknown as NurseProfile;
      expect(getOnboardingStatus(profile, completeUser())).toEqual({
        complete: true,
      });
    },
  );

  it.each([Credential.LPN, Credential.RN, Credential.NP])(
    "sends a %s with no license number back to step 2",
    (credential) => {
      const profile = {
        ...completeProfile(),
        credential,
        license_number: null,
      } as unknown as NurseProfile;
      expect(getOnboardingStatus(profile, completeUser())).toEqual({
        complete: false,
        nextStep: 2,
      });
    },
  );
});

// The bounce has to explain itself (#905). Three pages send a nurse into the
// wizard, and for the 24 already in this state that redirect is the whole of
// their experience of the product: they press nothing, and the dashboard they
// asked for turns into a form. The marker is what lets the wizard say why.
describe("the redirect into the wizard", () => {
  it("names the step and marks the arrival as a bounce", () => {
    expect(onboardingRedirectPath({ complete: false, nextStep: 3 })).toBe(
      "/dashboard/onboarding?step=3&unfinished=1",
    );
  });

  it.each(ONBOARDING_GATED_PAGES)(
    "%s redirects through the shared helper",
    (file) => {
      const source = readFileSync(file, "utf8");
      expect(source).toContain("onboardingRedirectPath(");
      // A hand-built path here is how the three copies drift apart, and a
      // nurse bounced by the one that forgot the marker gets no explanation.
      expect(source).not.toContain("/dashboard/onboarding?step=$");
    },
  );
});
