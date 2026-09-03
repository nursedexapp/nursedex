// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  act,
  cleanup,
  render,
  screen,
  fireEvent,
} from "@testing-library/react";

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("posthog-js", () => ({
  default: { __loaded: false, capture: vi.fn() },
}));

const updateNurseProfile = vi.fn();
vi.mock("@/lib/profile/actions", () => ({
  updateNurseProfile: (data: unknown) => updateNurseProfile(data),
}));

vi.mock("@/lib/subscriptions/actions", () => ({
  createNurseFeaturedCheckout: vi.fn(),
  redirectToCheckout: vi.fn(),
}));

import { ProfileEditForm } from "./ProfileEditForm";
import { STALL_MS } from "@/components/ui/pending-button";
import type { NurseProfile } from "@/types/database";
import {
  NurseTier,
  Credential,
  CareType,
  Gender,
  CommunicationPreference,
} from "@/types/enums";

// Phase 2 of #443. Saving the profile is an upsert, so a stalled save is safe to
// fire again: `retry` mode.
//
// WHO OWNS THE MESSAGE (the question #656 asks): the toast owns "it failed", the
// inline stall owns "it never answered". The third test here is the proof that
// they cannot both be on screen for the same save.

beforeEach(() => {
  vi.useFakeTimers();
  toastError.mockReset();
  toastSuccess.mockReset();
  updateNurseProfile.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

// A profile that passes fullProfileSchema on the first try, so the save actually
// reaches the server action rather than bouncing off validation. Only the fields
// the form reads are set: the rest of NurseProfile (id, slug, timestamps) never
// reaches the schema, hence the cast.
const profile = {
  tier: NurseTier.FREE,
  gender: Gender.FEMALE,
  years_experience: 8,
  languages: ["English"],
  credential: Credential.RN,
  license_number: "NY123456",
  care_types: [CareType.ELDERLY],
  primary_care_type: null,
  // Non-empty since #905: the edit form saves through fullProfileSchema, which
  // now requires one of each. Emptying these here would fail the save before it
  // reached the server action, which is not what these tests are about.
  skills: ["medication_management"],
  availability_commitment: ["part_time"],
  time_slots: ["weekdays"],
  rate_min: null,
  rate_max: null,
  has_transportation: true,
  covid_vaccinated: null,
  care_philosophy: "",
  additional_certs: [],
  bio: "Eight years of elder care across Queens and Nassau County.",
  photos: ["nurse/one.jpg"],
  travel_radius_miles: 15,
} as unknown as NurseProfile;

function setup() {
  render(
    <ProfileEditForm
      profile={profile}
      userName={{ first_name: "Ada", last_name: "Nurse" }}
      userEmail="ada@example.com"
      userPhone=""
      userZip="11779"
      userCommPref={CommunicationPreference.EMAIL}
      photoUrls={[null]}
    />,
  );

  return {
    save: async () => {
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
        await vi.advanceTimersByTimeAsync(0);
      });
    },
  };
}

describe("saving the profile", () => {
  it("shows the save is running and blocks a second one", async () => {
    updateNurseProfile.mockReturnValue(new Promise(() => {}));
    const { save } = setup();

    await save();

    expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();
    expect(updateNurseProfile).toHaveBeenCalledTimes(1);
  });

  it("hands back a retry when the save stalls, and re-saves", async () => {
    updateNurseProfile.mockReturnValue(new Promise(() => {}));
    const { save } = setup();

    await save();
    await advance(STALL_MS);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /try again/i }));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(updateNurseProfile).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();
  });

  it("lets the toast own a failure that arrives after the stall", async () => {
    let settle: (result: { error: string }) => void = () => {};
    updateNurseProfile.mockReturnValue(
      new Promise((resolve) => (settle = resolve)),
    );
    const { save } = setup();

    await save();
    await advance(STALL_MS);
    expect(screen.getByRole("alert")).toBeInTheDocument();

    await act(async () => {
      settle({ error: "Could not save your profile" });
      await vi.advanceTimersByTimeAsync(0);
    });

    // One failure, one message. The stall alert is gone the instant there is a
    // real answer to give.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(toastError).toHaveBeenCalledWith("Could not save your profile");
    expect(screen.getByRole("button", { name: /save changes/i })).toBeEnabled();
  });
});
