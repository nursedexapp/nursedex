import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { applyVisibleNurseFilter } from "@/lib/nurses/visibility";
import { ExternalReviewForm } from "@/components/reviews/ExternalReviewForm";
import { CREDENTIAL_LABELS } from "@/types/enums";

export const metadata: Metadata = {
  title: "Leave a review | NurseDex",
  robots: { index: false, follow: false },
};

interface ReviewLinkPageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Public review submission page.
 *
 * The URL uses the nurse's slug so it's friendly to share
 * (nursedex.com/reviews/jane-smith-rn) instead of a UUID. Internally
 * we still flow through the existing review_links token system: the
 * page resolves slug -> nurse, then ensures a token exists and passes
 * it to the form. The token only exists server-side; the visitor
 * never sees it. Submission and rate-limiting RPCs continue to use
 * the token as the trust handle.
 */
export default async function ReviewLinkPage({ params }: ReviewLinkPageProps) {
  const { slug } = await params;

  const service = createServiceRoleClient();

  // Resolve the slug to a publicly visible nurse (verified, not hidden, not
  // deleted/suspended). Pending or hidden profiles have no public review page.
  const { data: nurseRow } = await applyVisibleNurseFilter(
    service
      .from("nurse_profiles")
      .select(
        `
        user_id,
        slug,
        credential,
        users!inner(first_name, last_name, is_deleted, is_suspended)
      `,
      )
      .eq("slug", slug),
  ).maybeSingle();

  if (!nurseRow) notFound();

  type Resolved = {
    user_id: string;
    slug: string;
    credential: string;
    users: {
      first_name: string | null;
      last_name: string | null;
    };
  };
  const nurse = nurseRow as unknown as Resolved;

  // Get or create the review_links row for this nurse, server-side.
  // The form needs a token for submit_external_review's gate.
  const { data: existing } = await service
    .from("nurse_review_links")
    .select("token")
    .eq("nurse_user_id", nurse.user_id)
    .maybeSingle();

  let token = existing?.token as string | undefined;
  if (!token) {
    const { data: created, error: createErr } = await service
      .from("nurse_review_links")
      .insert({ nurse_user_id: nurse.user_id })
      .select("token")
      .single();
    if (createErr || !created) {
      console.error(
        "[reviews] could not create review link for nurse",
        nurse.user_id,
        createErr?.message,
      );
      notFound();
    }
    token = created.token as string;
  }

  const credentialLabel = nurse.credential
    ? (CREDENTIAL_LABELS[nurse.credential as keyof typeof CREDENTIAL_LABELS] ??
      nurse.credential)
    : null;

  const firstName = nurse.users.first_name ?? "this caregiver";

  return (
    <div className="flex flex-1 flex-col">
      <main className="mx-auto w-full max-w-xl flex-1 px-6 py-10">
        <header className="mb-6">
          <p className="text-muted-foreground text-sm">
            <Link
              href={`/nurses/${nurse.slug}`}
              className="text-teal hover:underline"
            >
              View {firstName}&apos;s profile
            </Link>
          </p>
          <h1 className="font-heading text-soft-black mt-2 text-2xl font-semibold sm:text-3xl">
            Review {firstName}
            {credentialLabel ? `, ${credentialLabel}` : ""}
          </h1>
          <p className="text-soft-black-light mt-2 text-sm">
            Your honest experience helps other New York families decide who to
            hire. We&apos;ll email you to confirm your review before it shows up
            on {firstName}&apos;s profile.
          </p>
        </header>

        <Card className="border-sage/20">
          <CardContent className="pt-5">
            <ExternalReviewForm linkToken={token} nurseFirstName={firstName} />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
