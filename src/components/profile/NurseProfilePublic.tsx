import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  CREDENTIAL_LABELS,
  CARE_TYPE_LABELS,
  SKILL_LABELS,
  AVAILABILITY_COMMITMENT_LABELS,
  TIME_SLOT_LABELS,
  COMMUNICATION_PREFERENCE_LABELS,
} from "@/types/enums";
import type {
  Credential,
  CareType,
  Skill,
  AvailabilityCommitment,
  TimeSlot,
  CommunicationPreference,
} from "@/types/enums";
import {
  MapPin,
  Clock,
  Car,
  Languages,
  ExternalLink,
  ImageIcon,
  Lock,
  Mail,
  Phone,
  MessageSquare,
  Star,
} from "lucide-react";
import Link from "next/link";
import type { PublicNurseProfile } from "@/lib/profile/queries";

type ViewMode = "anon" | "free" | "subscribed";

interface NurseProfilePublicProps {
  nurse: PublicNurseProfile;
  photoUrl: string | null;
  licenseVerifyUrl: string | null;
  distanceMiles: number | null;
  viewMode: ViewMode;
}

export function NurseProfilePublic({
  nurse,
  photoUrl,
  licenseVerifyUrl,
  distanceMiles,
  viewMode,
}: NurseProfilePublicProps) {
  const credentialLabel =
    CREDENTIAL_LABELS[nurse.credential as Credential] || nurse.credential;

  return (
    <div className="space-y-6">
      {/* Header: photo + name + credential */}
      <div className="flex gap-6">
        <div className="size-28 shrink-0 overflow-hidden rounded-xl border border-sage/20 bg-sage/10 sm:size-32">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={`${nurse.first_name} ${nurse.last_name}`}
              className="size-full object-cover"
            />
          ) : (
            <div className="flex size-full items-center justify-center">
              <ImageIcon className="size-10 text-muted-foreground/40" />
            </div>
          )}
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-2xl font-semibold sm:text-3xl">
              {nurse.first_name} {nurse.last_name}
            </h1>
            {nurse.tier === "featured" && (
              <Badge className="bg-teal text-white">Featured</Badge>
            )}
          </div>
          <p className="text-muted-foreground">{credentialLabel}</p>

          {nurse.years_experience !== null && (
            <p className="mt-1 text-sm text-muted-foreground">
              {nurse.years_experience} year
              {nurse.years_experience !== 1 ? "s" : ""} of experience
            </p>
          )}

          {/* Rating */}
          {nurse.avg_rating !== null && (
            <div className="mt-2 flex items-center gap-1">
              <Star className="size-4 fill-amber-400 text-amber-400" />
              <span className="text-sm font-medium">{nurse.avg_rating}</span>
              <span className="text-xs text-muted-foreground">
                ({nurse.review_count} review
                {nurse.review_count !== 1 ? "s" : ""})
              </span>
            </div>
          )}

          {/* Distance */}
          {distanceMiles !== null && (
            <div className="mt-2 flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="size-4" />
              {distanceMiles === 0
                ? "In your area"
                : `${distanceMiles} mile${distanceMiles !== 1 ? "s" : ""} away`}
            </div>
          )}

          {!nurse.is_available && (
            <Badge variant="secondary" className="mt-2">
              Not currently accepting clients
            </Badge>
          )}
        </div>
      </div>

      {/* Care types */}
      <div className="flex flex-wrap gap-1.5">
        {nurse.care_types.map((ct) => (
          <Badge
            key={ct}
            variant={ct === nurse.primary_care_type ? "default" : "secondary"}
            className={
              ct === nurse.primary_care_type ? "bg-teal text-white" : ""
            }
          >
            {CARE_TYPE_LABELS[ct as CareType] || ct}
          </Badge>
        ))}
      </div>

      {/* Anonymous users see limited info + signup CTA */}
      {viewMode === "anon" ? (
        <AnonCTA name={nurse.first_name} />
      ) : (
        <>
          {/* Bio */}
          {nurse.bio && (
            <Card className="border-sage/20">
              <CardContent className="pt-4">
                <h2 className="mb-2 text-sm font-semibold">About</h2>
                <p className="whitespace-pre-line text-sm leading-relaxed">
                  {nurse.bio}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Care philosophy */}
          {nurse.care_philosophy && (
            <Card className="border-sage/20">
              <CardContent className="pt-4">
                <h2 className="mb-2 text-sm font-semibold">Care Philosophy</h2>
                <p className="whitespace-pre-line text-sm italic leading-relaxed text-muted-foreground">
                  &ldquo;{nurse.care_philosophy}&rdquo;
                </p>
              </CardContent>
            </Card>
          )}

          {/* Details grid */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Skills */}
            {nurse.skills.length > 0 && (
              <Card className="border-sage/20">
                <CardContent className="pt-4">
                  <h2 className="mb-2 text-sm font-semibold">Skills</h2>
                  <div className="flex flex-wrap gap-1">
                    {nurse.skills.map((s) => (
                      <Badge key={s} variant="secondary" className="text-xs">
                        {SKILL_LABELS[s as Skill] || s}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Availability */}
            {(nurse.availability_commitment.length > 0 ||
              nurse.time_slots.length > 0) && (
              <Card className="border-sage/20">
                <CardContent className="pt-4">
                  <h2 className="mb-2 text-sm font-semibold">Availability</h2>
                  <div className="space-y-2 text-sm">
                    {nurse.availability_commitment.length > 0 && (
                      <div className="flex items-start gap-2">
                        <Clock className="mt-0.5 size-4 text-muted-foreground" />
                        <span>
                          {nurse.availability_commitment
                            .map(
                              (a) =>
                                AVAILABILITY_COMMITMENT_LABELS[
                                  a as AvailabilityCommitment
                                ] || a,
                            )
                            .join(", ")}
                        </span>
                      </div>
                    )}
                    {nurse.time_slots.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {nurse.time_slots.map((t) => (
                          <Badge
                            key={t}
                            variant="secondary"
                            className="text-xs"
                          >
                            {TIME_SLOT_LABELS[t as TimeSlot] || t}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Rate */}
            {(nurse.rate_min !== null || nurse.rate_max !== null) && (
              <Card className="border-sage/20">
                <CardContent className="pt-4">
                  <h2 className="mb-2 text-sm font-semibold">Hourly Rate</h2>
                  <p className="text-sm">
                    {nurse.rate_min !== null && nurse.rate_max !== null
                      ? `$${nurse.rate_min} - $${nurse.rate_max}/hr`
                      : nurse.rate_min !== null
                        ? `From $${nurse.rate_min}/hr`
                        : `Up to $${nurse.rate_max}/hr`}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Quick facts */}
            <Card className="border-sage/20">
              <CardContent className="pt-4">
                <h2 className="mb-2 text-sm font-semibold">Details</h2>
                <div className="space-y-2 text-sm">
                  {nurse.languages.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Languages className="size-4 text-muted-foreground" />
                      {nurse.languages.join(", ")}
                    </div>
                  )}
                  {nurse.has_transportation && (
                    <div className="flex items-center gap-2">
                      <Car className="size-4 text-muted-foreground" />
                      Has own transportation
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Additional certifications */}
          {nurse.additional_certs.length > 0 && (
            <>
              <Separator className="bg-sage/20" />
              <div>
                <h2 className="mb-2 text-sm font-semibold">
                  Additional Certifications
                </h2>
                <div className="flex flex-wrap gap-1.5">
                  {nurse.additional_certs.map((cert) => (
                    <Badge key={cert} variant="secondary">
                      {cert}
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* License info */}
          {nurse.license_number && (
            <>
              <Separator className="bg-sage/20" />
              <div className="text-sm">
                <h2 className="mb-2 font-semibold">License Information</h2>
                <div className="space-y-1 text-muted-foreground">
                  <p>
                    <strong>Credential:</strong> {credentialLabel}
                  </p>
                  <p>
                    <strong>State:</strong> New York
                  </p>
                  <p>
                    <strong>License Number:</strong> {nurse.license_number}
                  </p>
                  {licenseVerifyUrl && (
                    <a
                      href={licenseVerifyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-teal hover:underline"
                    >
                      Verify this license on the NY State database
                      <ExternalLink className="size-3" />
                    </a>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground/70">
                    NurseDex does not verify or monitor licenses. Families are
                    responsible for confirming current licensure.
                  </p>
                </div>
              </div>
            </>
          )}

          {/* Contact section */}
          <Separator className="bg-sage/20" />
          <ContactSection
            nurse={nurse}
            viewMode={viewMode}
          />
        </>
      )}
    </div>
  );
}

/**
 * CTA shown to anonymous visitors encouraging them to sign up.
 */
function AnonCTA({ name }: { name: string }) {
  return (
    <Card className="border-teal/20 bg-teal/5">
      <CardContent className="py-6 text-center">
        <Lock className="mx-auto mb-3 size-8 text-teal/60" />
        <h2 className="font-heading text-lg font-semibold">
          Want to learn more about {name}?
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Create a free account to view full profiles, including bio, skills,
          availability, and reviews.
        </p>
        <div className="mt-4 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
          <Link
            href="/signup"
            className="rounded-lg bg-teal px-6 py-2.5 font-body text-sm font-medium text-white transition-colors hover:bg-teal-dark"
          >
            Sign up free
          </Link>
          <Link
            href="/login"
            className="font-body text-sm text-teal transition-colors hover:text-teal-dark"
          >
            Already have an account? Log in
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Contact section with different states based on subscription.
 */
function ContactSection({
  nurse,
  viewMode,
}: {
  nurse: PublicNurseProfile;
  viewMode: "free" | "subscribed";
}) {
  const prefLabel = nurse.communication_preference
    ? COMMUNICATION_PREFERENCE_LABELS[
        nurse.communication_preference as CommunicationPreference
      ]
    : null;

  if (viewMode === "free") {
    return (
      <Card className="border-teal/20 bg-teal/5">
        <CardContent className="py-6 text-center">
          <Lock className="mx-auto mb-3 size-8 text-teal/60" />
          <h2 className="font-heading text-lg font-semibold">
            Contact {nurse.first_name}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Subscribe to reveal contact information and reach out directly.
          </p>
          {prefLabel && (
            <p className="mt-2 text-xs text-muted-foreground">
              {nurse.first_name} prefers to be contacted by{" "}
              {prefLabel.toLowerCase()}
            </p>
          )}
          <Link
            href="/dashboard"
            className="mt-4 inline-block rounded-lg bg-teal px-6 py-2.5 font-body text-sm font-medium text-white transition-colors hover:bg-teal-dark"
          >
            Subscribe to contact
          </Link>
        </CardContent>
      </Card>
    );
  }

  // Subscribed + revealed: show full contact info
  return (
    <Card className="border-sage/20">
      <CardContent className="pt-4">
        <h2 className="mb-3 text-sm font-semibold">Contact Information</h2>
        <div className="space-y-3 text-sm">
          {nurse.contact_email && (
            <a
              href={`mailto:${nurse.contact_email}?subject=NurseDex%20Inquiry`}
              className="flex items-center gap-2 text-teal hover:underline"
            >
              <Mail className="size-4" />
              {nurse.contact_email}
            </a>
          )}
          {nurse.contact_phone && (
            <a
              href={`tel:${nurse.contact_phone}`}
              className="flex items-center gap-2 text-teal hover:underline"
            >
              <Phone className="size-4" />
              {nurse.contact_phone}
            </a>
          )}
          {prefLabel && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <MessageSquare className="size-4" />
              Prefers contact by {prefLabel.toLowerCase()}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
