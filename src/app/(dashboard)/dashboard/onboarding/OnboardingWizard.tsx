"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import type { NurseProfileDraft } from "@/types/database";
import type { NurseProfile } from "@/types/database";
import {
  step1Schema,
  step2Schema,
  step3Schema,
  step4Schema,
  step5Schema,
} from "@/lib/schemas/profile";
import { saveOnboardingStep, completeOnboarding } from "@/lib/profile/actions";
import { captureClientEvent } from "@/lib/analytics/capture";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { StepLayout } from "@/components/profile-form/StepLayout";
import { BasicsFields } from "@/components/profile-form/BasicsFields";
import { CredentialsFields } from "@/components/profile-form/CredentialsFields";
import { SkillsFields } from "@/components/profile-form/SkillsFields";
import { BioFields } from "@/components/profile-form/BioFields";
import { ContactFields } from "@/components/profile-form/ContactFields";
import type { NurseTier } from "@/types/enums";

const STORAGE_KEY = "nursedex_onboarding_draft";
const TOTAL_STEPS = 5;

/**
 * Stable analytics names for the steps, deliberately not the on-screen titles:
 * a title is copy and will be reworded, and a renamed value silently splits one
 * funnel step into two in PostHog with nothing reporting it.
 */
const STEP_NAMES: Record<number, string> = {
  1: "basics",
  2: "credentials",
  3: "skills",
  4: "bio_photos",
  5: "contact",
};

interface OnboardingWizardProps {
  profile: NurseProfile;
  userName: { first_name: string | null; last_name: string | null };
  userEmail: string;
  initialPhotoUrls: (string | null)[];
}

function parseZodErrors(error: {
  issues: Array<{ path: PropertyKey[]; message: string }>;
}) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0]);
    if (!fieldErrors[field]) {
      fieldErrors[field] = issue.message;
    }
  }
  return fieldErrors;
}

export function OnboardingWizard({
  profile,
  userName,
  userEmail,
  initialPhotoUrls,
}: OnboardingWizardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentStep = Math.min(
    Math.max(parseInt(searchParams.get("step") || "1", 10), 1),
    TOTAL_STEPS,
  );

  const [draft, setDraft] = useState<NurseProfileDraft>({});
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [photoUrls, setPhotoUrls] =
    useState<(string | null)[]>(initialPhotoUrls);

  const tier: NurseTier = profile.tier;

  // Load draft from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as NurseProfileDraft;
        setDraft(parsed);
      } else {
        // Pre-fill from existing profile/user data
        setDraft({
          first_name: userName.first_name || "",
          last_name: userName.last_name || "",
          gender: profile.gender || undefined,
          years_experience: profile.years_experience ?? undefined,
          languages:
            profile.languages.length > 0 ? profile.languages : ["English"],
          credential:
            profile.credential === "hha" ? undefined : profile.credential,
          license_number: profile.license_number || undefined,
          care_types:
            profile.care_types.length > 0 ? profile.care_types : undefined,
          primary_care_type: profile.primary_care_type || undefined,
          skills: profile.skills.length > 0 ? profile.skills : undefined,
          availability_commitment:
            profile.availability_commitment.length > 0
              ? profile.availability_commitment
              : undefined,
          time_slots:
            profile.time_slots.length > 0 ? profile.time_slots : undefined,
          rate_min: profile.rate_min ?? undefined,
          rate_max: profile.rate_max ?? undefined,
          has_transportation: profile.has_transportation,
          covid_vaccinated: profile.covid_vaccinated ?? undefined,
          care_philosophy: profile.care_philosophy || undefined,
          additional_certs:
            profile.additional_certs.length > 0
              ? profile.additional_certs
              : undefined,
          contact_email: userEmail || undefined,
          zip_code: undefined,
          travel_radius_miles: profile.travel_radius_miles ?? undefined,
        });
      }
    } catch {
      // localStorage unavailable, start fresh
    }
    setLoaded(true);
  }, [profile, userName, userEmail]);

  // Fired once when a nurse reaches step 1 with nothing completed yet. A reload
  // before the first save can repeat it, so any funnel built on this counts
  // PEOPLE rather than events. Firing on plain mount would have counted every
  // step navigation as a fresh start, since each step is its own route push.
  const startedFired = useRef(false);
  useEffect(() => {
    if (!loaded || startedFired.current) return;
    if (currentStep !== 1) return;
    if ((draft.completed_step ?? 0) > 0) return;
    startedFired.current = true;
    captureClientEvent(ANALYTICS_EVENTS.ONBOARDING_STARTED, { tier });
  }, [loaded, currentStep, draft.completed_step, tier]);

  // Save draft to localStorage whenever it changes. Uses the functional
  // setState form so back-to-back updates compose correctly. The earlier
  // signature (saveDraft(nextDraft)) closed over `draft` at call time,
  // so two updateField calls in the same tick (e.g. CheckboxGroup
  // setting both care_types and primary_care_type when reaching length
  // 1) would each spread the same stale draft and the second would
  // clobber the first. Now the updater always sees the freshest state.
  const saveDraft = useCallback(
    (updater: (prev: NurseProfileDraft) => NurseProfileDraft) => {
      setDraft((prev) => {
        const next = updater(prev);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // localStorage full or unavailable
        }
        return next;
      });
    },
    [],
  );

  const updateField = useCallback(
    (field: string, value: unknown) => {
      saveDraft((prev) => ({ ...prev, [field]: value }));
      // Clear error for this field when it changes
      setErrors((prev) =>
        prev[field] ? { ...prev, [field]: undefined } : prev,
      );
    },
    [saveDraft],
  );

  const goToStep = useCallback(
    (step: number) => {
      router.push(`/dashboard/onboarding?step=${step}`);
    },
    [router],
  );

  const markStepComplete = useCallback(
    (step: number) => {
      saveDraft((prev) => ({
        ...prev,
        completed_step: Math.max(prev.completed_step || 0, step),
      }));
    },
    [saveDraft],
  );

  // ── Generic step submit handler ───────────────────────────

  // Who owns the message on this surface (#656). The toast owns "the save came
  // back and it failed". The stall alert on the Continue button owns "the save
  // never came back at all". They cannot collide: the alert only exists while
  // isSubmitting is true, and every toast below is raised after the action has
  // returned, which clears isSubmitting in the same commit.
  const submitStep = async (
    step: number,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    schema: { safeParse: (data: unknown) => any },
    data: Record<string, unknown>,
    nextStep: number,
  ) => {
    setErrors({});
    const result = schema.safeParse(data);

    if (!result.success) {
      setErrors(parseZodErrors(result.error));
      return;
    }

    setIsSubmitting(true);
    const saveResult = await saveOnboardingStep(step, result.data);

    if (saveResult.error) {
      toast.error(saveResult.error);
      setIsSubmitting(false);
      return;
    }

    markStepComplete(step);
    captureClientEvent(ANALYTICS_EVENTS.ONBOARDING_STEP_COMPLETED, {
      step,
      step_name: STEP_NAMES[step],
      total_steps: TOTAL_STEPS,
      tier,
    });
    setIsSubmitting(false);
    goToStep(nextStep);
  };

  // ── Step handlers ─────────────────────────────────────────

  const handleStep1Next = () =>
    submitStep(
      1,
      step1Schema,
      {
        first_name: draft.first_name || "",
        last_name: draft.last_name || "",
        gender: draft.gender || undefined,
        years_experience:
          draft.years_experience === undefined
            ? undefined
            : draft.years_experience,
        languages: draft.languages || [],
      },
      2,
    );

  const handleStep2Next = () =>
    submitStep(
      2,
      step2Schema(tier),
      {
        credential: draft.credential || undefined,
        license_number: draft.license_number || "",
        care_types: draft.care_types || [],
        primary_care_type: draft.primary_care_type ?? null,
      },
      3,
    );

  const handleStep3Next = () =>
    submitStep(
      3,
      step3Schema,
      {
        skills: draft.skills || [],
        availability_commitment: draft.availability_commitment || [],
        time_slots: draft.time_slots || [],
        rate_min: draft.rate_min ?? null,
        rate_max: draft.rate_max ?? null,
        has_transportation: draft.has_transportation ?? false,
        covid_vaccinated: draft.covid_vaccinated ?? null,
        care_philosophy: draft.care_philosophy || null,
        additional_certs: draft.additional_certs || [],
      },
      4,
    );

  const handleStep4Next = () =>
    submitStep(
      4,
      step4Schema(tier),
      {
        bio: draft.bio || "",
        photos: draft.photos || [],
      },
      5,
    );

  const handleStep5Next = async () => {
    setErrors({});

    const result = step5Schema.safeParse({
      contact_email: draft.contact_email || "",
      contact_phone: draft.contact_phone || "",
      communication_preference: draft.communication_preference || undefined,
      zip_code: draft.zip_code || "",
      travel_radius_miles:
        draft.travel_radius_miles === undefined
          ? undefined
          : draft.travel_radius_miles,
    });

    if (!result.success) {
      setErrors(parseZodErrors(result.error));
      return;
    }

    setIsSubmitting(true);

    // Save step 5 data
    const saveResult = await saveOnboardingStep(5, result.data);
    if (saveResult.error) {
      toast.error(saveResult.error);
      setIsSubmitting(false);
      return;
    }

    // Complete onboarding (generate slug, calc completeness, send email)
    const completeResult = await completeOnboarding();
    if (completeResult.error) {
      toast.error(completeResult.error);
      setIsSubmitting(false);
      return;
    }

    // Clear localStorage draft
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }

    captureClientEvent(ANALYTICS_EVENTS.ONBOARDING_COMPLETED, {
      total_steps: TOTAL_STEPS,
      tier,
    });

    setIsSubmitting(false);
    toast.success("Profile saved. Verification next.");
    router.push("/dashboard?onboarding=complete");
  };

  // ── Render ────────────────────────────────────────────────

  if (!loaded) {
    return (
      <div className="mx-auto w-full max-w-2xl animate-pulse space-y-6">
        <div className="bg-sage/20 h-8 w-48 rounded" />
        <div className="bg-sage/20 h-4 w-72 rounded" />
        <div className="space-y-4">
          <div className="bg-sage/20 h-10 rounded" />
          <div className="bg-sage/20 h-10 rounded" />
          <div className="bg-sage/20 h-10 rounded" />
        </div>
      </div>
    );
  }

  // Step 1: Basics
  if (currentStep === 1) {
    return (
      <StepLayout
        step={1}
        title="Let's start with the basics"
        description="Tell us about yourself so families can get to know you."
        onNext={handleStep1Next}
        isSubmitting={isSubmitting}
      >
        <BasicsFields
          values={{
            first_name: draft.first_name || "",
            last_name: draft.last_name || "",
            gender: draft.gender || "",
            years_experience: draft.years_experience ?? "",
            languages: draft.languages || ["English"],
          }}
          onChange={updateField}
          errors={errors}
        />
      </StepLayout>
    );
  }

  // Step 2: Credentials
  if (currentStep === 2) {
    return (
      <StepLayout
        step={2}
        title="Your credentials"
        description="Share your professional credentials and care types."
        onBack={() => goToStep(1)}
        onNext={handleStep2Next}
        isSubmitting={isSubmitting}
      >
        <CredentialsFields
          values={{
            credential: draft.credential || "",
            license_number: draft.license_number || "",
            care_types: draft.care_types || [],
            primary_care_type: draft.primary_care_type ?? null,
          }}
          tier={tier}
          onChange={updateField}
          errors={errors}
        />
      </StepLayout>
    );
  }

  // Step 3: Skills & Details
  if (currentStep === 3) {
    return (
      <StepLayout
        step={3}
        title="Skills and details"
        description="Tell families about your skills, availability, and preferences."
        onBack={() => goToStep(2)}
        onNext={handleStep3Next}
        isSubmitting={isSubmitting}
      >
        <SkillsFields
          values={{
            skills: draft.skills || [],
            availability_commitment: draft.availability_commitment || [],
            time_slots: draft.time_slots || [],
            rate_min: draft.rate_min ?? "",
            rate_max: draft.rate_max ?? "",
            has_transportation: draft.has_transportation ?? false,
            covid_vaccinated: draft.covid_vaccinated ?? null,
            care_philosophy: draft.care_philosophy || "",
            additional_certs: draft.additional_certs || [],
          }}
          onChange={updateField}
          errors={errors}
        />
      </StepLayout>
    );
  }

  // Step 4: Bio & Photos
  if (currentStep === 4) {
    return (
      <StepLayout
        step={4}
        title="Bio and photos"
        description="Write a bio and upload a professional photo to make your profile stand out."
        onBack={() => goToStep(3)}
        onNext={handleStep4Next}
        isSubmitting={isSubmitting}
      >
        <BioFields
          values={{
            bio: draft.bio || "",
            photos: draft.photos || [],
          }}
          photoUrls={photoUrls}
          tier={tier}
          onChange={(field, value) => {
            updateField(field, value);
            // When photos change, we need to update URLs too
            // New photos won't have URLs until page reload, but that's OK
            // since the PhotoUpload component handles its own preview
            if (field === "photos") {
              const newPhotos = value as string[];
              // Keep existing URLs for photos that didn't change
              setPhotoUrls(
                newPhotos.map((path) => {
                  const existingIdx = (draft.photos || []).indexOf(path);
                  return existingIdx >= 0
                    ? (photoUrls[existingIdx] ?? null)
                    : null;
                }),
              );
            }
          }}
          errors={errors}
        />
      </StepLayout>
    );
  }

  // Step 5: Contact Info
  return (
    <StepLayout
      step={5}
      title="Contact information"
      description="How families will reach you. Your zip code is never shown publicly."
      onBack={() => goToStep(4)}
      onNext={handleStep5Next}
      nextLabel="Complete Profile"
      isSubmitting={isSubmitting}
    >
      <ContactFields
        values={{
          contact_email: draft.contact_email || "",
          contact_phone: draft.contact_phone || "",
          communication_preference: draft.communication_preference || "",
          zip_code: draft.zip_code || "",
          travel_radius_miles: draft.travel_radius_miles ?? "",
        }}
        onChange={updateField}
        errors={errors}
      />
    </StepLayout>
  );
}
