"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import posthog from "posthog-js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PendingButton } from "@/components/ui/pending-button";
import { BasicsFields } from "@/components/profile-form/BasicsFields";
import { CredentialsFields } from "@/components/profile-form/CredentialsFields";
import { SkillsFields } from "@/components/profile-form/SkillsFields";
import { BioFields } from "@/components/profile-form/BioFields";
import { ContactFields } from "@/components/profile-form/ContactFields";
import { fullProfileSchema } from "@/lib/schemas/profile";
import { updateNurseProfile } from "@/lib/profile/actions";
import {
  createNurseFeaturedCheckout,
  redirectToCheckout,
} from "@/lib/subscriptions/actions";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";
import type { NurseProfile } from "@/types/database";
import type { NurseTier } from "@/types/enums";

interface ProfileEditFormProps {
  profile: NurseProfile;
  userName: { first_name: string; last_name: string };
  userEmail: string;
  userPhone: string;
  userZip: string;
  userCommPref: string;
  photoUrls: (string | null)[];
}

function showFeaturedUpsellToast() {
  if (posthog.__loaded) {
    posthog.capture(ANALYTICS_EVENTS.FEATURED_UPSELL_SHOWN, {
      surface: "profile_edit",
    });
  }

  toast.success("Profile updated", {
    description:
      "A family saved your profile. Featured nurses get priority verification, top placement in search, analytics, and a verified badge.",
    duration: 12000,
    action: {
      label: "Upgrade",
      onClick: async () => {
        if (posthog.__loaded) {
          posthog.capture(ANALYTICS_EVENTS.FEATURED_UPSELL_CLICKED, {
            surface: "profile_edit",
          });
          posthog.capture(ANALYTICS_EVENTS.SUBSCRIPTION_STARTED, {
            plan: "nurse_featured",
            interval: "month",
            source: "profile_edit_upsell",
          });
        }
        const result = await createNurseFeaturedCheckout();
        if (result.error) {
          toast.error(result.error);
          return;
        }
        await redirectToCheckout(result);
      },
    },
  });
}

export function ProfileEditForm({
  profile,
  userName,
  userEmail,
  userPhone,
  userZip,
  userCommPref,
  photoUrls: initialPhotoUrls,
}: ProfileEditFormProps) {
  const router = useRouter();
  const tier: NurseTier = profile.tier;

  // Form state (all fields in one object)
  const [values, setValues] = useState({
    first_name: userName.first_name,
    last_name: userName.last_name,
    gender: profile.gender || "",
    years_experience: profile.years_experience as number | "",
    languages: profile.languages,
    credential: profile.credential,
    license_number: profile.license_number || "",
    care_types: profile.care_types as string[],
    primary_care_type: profile.primary_care_type as string | null,
    skills: profile.skills as string[],
    availability_commitment: profile.availability_commitment as string[],
    time_slots: profile.time_slots as string[],
    rate_min: profile.rate_min as number | "" | null,
    rate_max: profile.rate_max as number | "" | null,
    has_transportation: profile.has_transportation,
    covid_vaccinated: profile.covid_vaccinated,
    care_philosophy: profile.care_philosophy || "",
    additional_certs: profile.additional_certs as string[],
    bio: profile.bio || "",
    photos: profile.photos as string[],
    contact_email: userEmail,
    contact_phone: userPhone,
    communication_preference: userCommPref,
    zip_code: userZip,
    travel_radius_miles: profile.travel_radius_miles as number | "",
  });

  const [photoUrls, setPhotoUrls] = useState(initialPhotoUrls);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState("basics");

  const updateField = (field: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }

    // Handle photo URL tracking
    if (field === "photos") {
      const newPhotos = value as string[];
      setPhotoUrls(
        newPhotos.map((path) => {
          const existingIdx = values.photos.indexOf(path);
          return existingIdx >= 0 ? (photoUrls[existingIdx] ?? null) : null;
        }),
      );
    }
  };

  const handleSave = async () => {
    setErrors({});

    const schema = fullProfileSchema(tier);
    const result = schema.safeParse({
      ...values,
      years_experience:
        values.years_experience === "" ? undefined : values.years_experience,
      rate_min: values.rate_min === "" ? null : values.rate_min,
      rate_max: values.rate_max === "" ? null : values.rate_max,
      travel_radius_miles:
        values.travel_radius_miles === ""
          ? undefined
          : values.travel_radius_miles,
      contact_email: values.contact_email || "",
      contact_phone: values.contact_phone || "",
      care_philosophy: values.care_philosophy || null,
      covid_vaccinated: values.covid_vaccinated ?? null,
      primary_care_type: values.primary_care_type ?? null,
    });

    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      // Track which tabs have errors
      const tabErrors = new Set<string>();

      for (const issue of result.error.issues) {
        const field = String(issue.path[0]);
        if (!fieldErrors[field]) {
          fieldErrors[field] = issue.message;
        }
        // Map fields to tabs
        if (
          [
            "first_name",
            "last_name",
            "gender",
            "years_experience",
            "languages",
          ].includes(field)
        ) {
          tabErrors.add("basics");
        } else if (
          [
            "credential",
            "license_number",
            "care_types",
            "primary_care_type",
          ].includes(field)
        ) {
          tabErrors.add("credentials");
        } else if (
          [
            "skills",
            "availability_commitment",
            "time_slots",
            "rate_min",
            "rate_max",
            "has_transportation",
            "covid_vaccinated",
            "care_philosophy",
            "additional_certs",
          ].includes(field)
        ) {
          tabErrors.add("skills");
        } else if (["bio", "photos"].includes(field)) {
          tabErrors.add("bio");
        } else {
          tabErrors.add("contact");
        }
      }

      setErrors(fieldErrors);

      // Navigate to first tab with errors
      const tabOrder = ["basics", "credentials", "skills", "bio", "contact"];
      const firstErrorTab = tabOrder.find((t) => tabErrors.has(t));
      if (firstErrorTab) setActiveTab(firstErrorTab);

      toast.error("Please fix the errors before saving");
      return;
    }

    setIsSubmitting(true);
    const saveResult = await updateNurseProfile(result.data);

    if (saveResult.error) {
      toast.error(saveResult.error);
    } else if (saveResult.upsellHint) {
      showFeaturedUpsellToast();
      router.refresh();
    } else {
      toast.success("Profile updated");
      router.refresh();
    }

    setIsSubmitting(false);
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="basics">Basics</TabsTrigger>
          <TabsTrigger value="credentials">Credentials</TabsTrigger>
          <TabsTrigger value="skills">Skills</TabsTrigger>
          <TabsTrigger value="bio">Bio & Photos</TabsTrigger>
          <TabsTrigger value="contact">Contact</TabsTrigger>
        </TabsList>

        <TabsContent value="basics" className="space-y-6 pt-4">
          <BasicsFields
            values={{
              first_name: values.first_name,
              last_name: values.last_name,
              gender: values.gender,
              years_experience: values.years_experience,
              languages: values.languages,
            }}
            onChange={updateField}
            errors={errors}
          />
        </TabsContent>

        <TabsContent value="credentials" className="space-y-6 pt-4">
          <CredentialsFields
            values={{
              credential: values.credential,
              license_number: values.license_number,
              care_types: values.care_types,
              primary_care_type: values.primary_care_type,
            }}
            tier={tier}
            onChange={updateField}
            errors={errors}
          />
        </TabsContent>

        <TabsContent value="skills" className="space-y-6 pt-4">
          <SkillsFields
            values={{
              skills: values.skills,
              availability_commitment: values.availability_commitment,
              time_slots: values.time_slots,
              rate_min: values.rate_min,
              rate_max: values.rate_max,
              has_transportation: values.has_transportation,
              covid_vaccinated: values.covid_vaccinated,
              care_philosophy: values.care_philosophy,
              additional_certs: values.additional_certs,
            }}
            onChange={updateField}
            errors={errors}
          />
        </TabsContent>

        <TabsContent value="bio" className="space-y-6 pt-4">
          <BioFields
            values={{
              bio: values.bio,
              photos: values.photos,
            }}
            photoUrls={photoUrls}
            tier={tier}
            onChange={updateField}
            errors={errors}
          />
        </TabsContent>

        <TabsContent value="contact" className="space-y-6 pt-4">
          <ContactFields
            values={{
              contact_email: values.contact_email,
              contact_phone: values.contact_phone,
              communication_preference: values.communication_preference,
              zip_code: values.zip_code,
              travel_radius_miles: values.travel_radius_miles,
            }}
            onChange={updateField}
            errors={errors}
          />
        </TabsContent>
      </Tabs>

      {/* Save button. Updating a profile is an upsert (#443 phase 2), so a
          stalled save is safe to fire again.

          Who owns the message: the toast owns "the save failed", this button's
          stall alert owns "the save never answered". They cannot both be on
          screen, because the alert only lives while isSubmitting is true and
          every toast in handleSave is raised after the action has returned. */}
      <div className="border-sage/20 flex justify-end border-t pt-4">
        <PendingButton
          pending={isSubmitting}
          mode="retry"
          idleLabel="Save changes"
          workingLabel="Saving..."
          slowLabel="Still saving..."
          onClick={handleSave}
          onRetry={handleSave}
        />
      </div>
    </div>
  );
}
