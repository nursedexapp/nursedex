import Image from "next/image";
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
import { RevealCTA } from "@/components/reveals/RevealCTA";
import { ReviewStateAction } from "@/components/reviews/ReviewStateAction";
import { ReviewList } from "@/components/reviews/ReviewList";
import type { Review } from "@/types/database";
import type { ApprovedReview } from "@/lib/reviews/queries";

type ViewMode = "anon" | "free" | "subscribed";
type RevealMode = "anon" | "no_sub" | "subscribed" | null;

interface NurseProfilePublicProps {
  nurse: PublicNurseProfile;
  photoUrl: string | null;
  licenseVerifyUrl: string | null;
  distanceMiles: number | null;
  viewMode: ViewMode;
  revealMode?: RevealMode;
  /** The viewer's existing platform review for this nurse, if any. Only
   *  meaningful when viewMode === "subscribed". */
  viewerReview?: Review | null;
  /** Viewer's first name, prefilled into the review form. */
  viewerFirstName?: string;
  /** Approved public reviews to render under the profile. */
  approvedReviews?: ApprovedReview[];
}

export function NurseProfilePublic({
  nurse,
  photoUrl,
  licenseVerifyUrl,
  distanceMiles,
  viewMode,
  revealMode = null,
  viewerReview = null,
  viewerFirstName = "",
  approvedReviews = [],
}: NurseProfilePublicProps) {
  const credentialLabel =
    CREDENTIAL_LABELS[nurse.credential as Credential] || nurse.credential;

  return (
    <div className="space-y-6">
      {/* Header: photo + name + credential */}
      <div className="flex gap-6">
        <div className="border-sage/20 bg-sage/10 relative size-28 shrink-0 overflow-hidden rounded-xl border sm:size-32">
          {photoUrl ? (
            <Image
              src={photoUrl}
              alt={`${nurse.first_name} ${nurse.last_name}`}
              fill
              sizes="(min-width: 640px) 128px, 112px"
              className="object-cover"
            />
          ) : (
            <div className="flex size-full items-center justify-center">
              <ImageIcon className="text-muted-foreground/40 size-10" />
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
            <p className="text-muted-foreground mt-1 text-sm">
              {nurse.years_experience} year
              {nurse.years_experience !== 1 ? "s" : ""} of experience
            </p>
          )}

          {/* Rating */}
          {nurse.avg_rating !== null && (
            <div className="mt-2 flex items-center gap-1">
              <Star className="size-4 fill-amber-400 text-amber-400" />
              <span className="text-sm font-medium">{nurse.avg_rating}</span>
              <span className="text-muted-foreground text-xs">
                ({nurse.review_count} review
                {nurse.review_count !== 1 ? "s" : ""})
              </span>
            </div>
          )}

          {/* Distance */}
          {distanceMiles !== null && (
            <div className="text-muted-foreground mt-2 flex items-center gap-1 text-sm">
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
                <p className="text-sm leading-relaxed whitespace-pre-line">
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
                <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-line italic">
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
                        <Clock className="text-muted-foreground mt-0.5 size-4" />
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
                      <Languages className="text-muted-foreground size-4" />
                      {nurse.languages.join(", ")}
                    </div>
                  )}
                  {nurse.has_transportation && (
                    <div className="flex items-center gap-2">
                      <Car className="text-muted-foreground size-4" />
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
                <div className="text-muted-foreground space-y-1">
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
                      className="text-teal inline-flex items-center gap-1 hover:underline"
                    >
                      Verify this license on the NY State database
                      <ExternalLink className="size-3" />
                    </a>
                  )}
                  <p className="text-muted-foreground/70 mt-2 text-xs">
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
            revealMode={revealMode}
          />

          {/* Review CTA, only after the family has revealed */}
          {viewMode === "subscribed" && (
            <Card className="border-sage/20">
              <CardContent className="space-y-3 pt-4">
                <h2 className="text-sm font-semibold">
                  Worked with {nurse.first_name}?
                </h2>
                <p className="text-muted-foreground text-xs">
                  Share your experience to help other families on Long Island
                  decide.
                </p>
                <ReviewStateAction
                  nurseUserId={nurse.user_id}
                  nurseFirstName={nurse.first_name}
                  defaultFirstName={viewerFirstName}
                  review={viewerReview}
                />
              </CardContent>
            </Card>
          )}

          {/* Public approved reviews */}
          <Separator className="bg-sage/20" />
          <section aria-label="Reviews">
            <h2 className="font-heading text-soft-black mb-3 text-base font-semibold">
              Reviews
            </h2>
            <ReviewList
              nurseFirstName={nurse.first_name}
              reviews={approvedReviews}
            />
          </section>
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
        <Lock className="text-teal/60 mx-auto mb-3 size-8" />
        <h2 className="font-heading text-lg font-semibold">
          Want to learn more about {name}?
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Create a free account to view full profiles, including bio, skills,
          availability, and reviews.
        </p>
        <div className="mt-4 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
          <Link
            href="/signup"
            className="bg-teal font-body hover:bg-teal-dark rounded-lg px-6 py-2.5 text-sm font-medium text-white transition-colors"
          >
            Sign up free
          </Link>
          <Link
            href="/login"
            className="font-body text-teal hover:text-teal-dark text-sm transition-colors"
          >
            Already have an account? Log in
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Contact section. Shows either the revealed contact info (server-rendered
 * when the family has already revealed this nurse) or a reveal CTA that
 * triggers paywall → checkout → reveal.
 *
 * For nurses/admins viewing other profiles, no contact info is shown.
 */
function ContactSection({
  nurse,
  viewMode,
  revealMode,
}: {
  nurse: PublicNurseProfile;
  viewMode: "free" | "subscribed";
  revealMode: "anon" | "no_sub" | "subscribed" | null;
}) {
  const prefLabel = nurse.communication_preference
    ? COMMUNICATION_PREFERENCE_LABELS[
        nurse.communication_preference as CommunicationPreference
      ]
    : null;

  // Revealed: server-render the contact info directly.
  if (viewMode === "subscribed") {
    return (
      <Card className="border-sage/20">
        <CardContent className="pt-4">
          <h2 className="mb-3 text-sm font-semibold">Contact Information</h2>
          <div className="space-y-3 text-sm">
            {nurse.contact_email && (
              <a
                href={`mailto:${nurse.contact_email}?subject=NurseDex%20Inquiry`}
                className="text-teal flex items-center gap-2 hover:underline"
              >
                <Mail className="size-4" />
                {nurse.contact_email}
              </a>
            )}
            {nurse.contact_phone && (
              <>
                <a
                  href={`tel:${nurse.contact_phone}`}
                  className="text-teal flex items-center gap-2 hover:underline"
                >
                  <Phone className="size-4" />
                  Call {nurse.contact_phone}
                </a>
                <a
                  href={`sms:${nurse.contact_phone}`}
                  className="text-teal flex items-center gap-2 hover:underline"
                >
                  <MessageSquare className="size-4" />
                  Text {nurse.contact_phone}
                </a>
              </>
            )}
            {prefLabel && (
              <div className="text-muted-foreground flex items-center gap-2">
                <MessageSquare className="size-4" />
                Prefers contact by {prefLabel.toLowerCase()}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Family/anon viewer: reveal CTA. For nurses/admins (revealMode === null
  // and viewMode === free), show nothing.
  if (revealMode === null) return null;

  return (
    <Card className="border-teal/20 bg-teal/5">
      <CardContent className="py-6 text-center">
        <Lock className="text-teal/60 mx-auto mb-3 size-8" />
        <h2 className="font-heading text-lg font-semibold">
          Contact {nurse.first_name}
        </h2>
        {prefLabel && (
          <p className="text-muted-foreground mt-1 text-xs">
            {nurse.first_name} prefers to be contacted by{" "}
            {prefLabel.toLowerCase()}
          </p>
        )}
        <div className="mt-4 flex justify-center">
          <RevealCTA
            nurseUserId={nurse.user_id}
            nurseFirstName={nurse.first_name}
            returnTo={`/nurses/${nurse.slug}`}
            mode={revealMode}
          />
        </div>
      </CardContent>
    </Card>
  );
}
