import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/shared/Header";
import { Footer } from "@/components/shared/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { ExternalReviewForm } from "@/components/reviews/ExternalReviewForm";
import { CREDENTIAL_LABELS } from "@/types/enums";

export const metadata: Metadata = {
  title: "Leave a review | NurseDex",
  robots: { index: false, follow: false },
};

interface ReviewLinkPageProps {
  params: Promise<{ token: string }>;
}

export default async function ReviewLinkPage({ params }: ReviewLinkPageProps) {
  const { token } = await params;

  const service = createServiceRoleClient();
  const { data, error } = await service
    .rpc("resolve_review_link", { p_token: token })
    .single();

  if (error || !data) notFound();

  type Resolved = {
    nurse_user_id: string;
    first_name: string;
    last_name: string;
    slug: string;
  };
  const nurse = data as unknown as Resolved;

  // Fetch credential separately for the page header.
  const { data: profile } = await service
    .from("nurse_profiles")
    .select("credential")
    .eq("user_id", nurse.nurse_user_id)
    .single();

  const credentialLabel = profile?.credential
    ? (CREDENTIAL_LABELS[
        profile.credential as keyof typeof CREDENTIAL_LABELS
      ] ?? profile.credential)
    : null;

  return (
    <div className="bg-warm-white flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-xl flex-1 px-6 py-10">
        <header className="mb-6">
          <p className="text-muted-foreground text-sm">
            <Link
              href={`/nurses/${nurse.slug}`}
              className="text-teal hover:underline"
            >
              View {nurse.first_name}&apos;s profile
            </Link>
          </p>
          <h1 className="font-heading text-soft-black mt-2 text-2xl font-semibold sm:text-3xl">
            Review {nurse.first_name} {nurse.last_name}
            {credentialLabel ? `, ${credentialLabel}` : ""}
          </h1>
          <p className="text-soft-black-light mt-2 text-sm">
            Your honest experience helps other Long Island families decide who
            to hire. We&apos;ll email you to confirm your review before it shows
            up on {nurse.first_name}&apos;s profile.
          </p>
        </header>

        <Card className="border-sage/20">
          <CardContent className="pt-5">
            <ExternalReviewForm
              linkToken={token}
              nurseFirstName={nurse.first_name}
            />
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
}
