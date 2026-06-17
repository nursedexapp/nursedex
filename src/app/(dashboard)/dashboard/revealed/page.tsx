import type { Metadata } from "next";
import Link from "next/link";
import { Eye } from "lucide-react";
import { requireRole } from "@/lib/auth/helpers";
import { UserRole } from "@/types/enums";
import { NurseCard } from "@/components/nurses/NurseCard";
import { Badge } from "@/components/ui/badge";
import { getRevealedNurses } from "@/lib/reveals/queries";
import { getFamilyReviewsByNurse } from "@/lib/reviews/queries";
import { ReviewStateAction } from "@/components/reviews/ReviewStateAction";
import { getFamilyHiresByNurse } from "@/lib/hires/queries";
import { HireButton } from "@/components/hires/HireButton";

export const metadata: Metadata = {
  title: "Revealed nurses | NurseDex",
};

export default async function RevealedPage() {
  const user = await requireRole(UserRole.FAMILY);
  const revealed = await getRevealedNurses(user.id);
  const nurseIds = revealed.map((n) => n.user_id);
  const [reviewsByNurse, hiresByNurse] = await Promise.all([
    getFamilyReviewsByNurse(user.id, nurseIds),
    getFamilyHiresByNurse(user.id, nurseIds),
  ]);

  return (
    <div className="mx-auto w-full max-w-5xl p-6 sm:p-8">
      <header className="mb-6">
        <h1 className="font-heading text-soft-black text-2xl font-semibold sm:text-3xl">
          Revealed nurses
        </h1>
        <p className="text-soft-black-light mt-1 text-sm">
          Nurses whose contact info you&apos;ve unlocked. You can always come
          back here to message them or leave a review.
        </p>
      </header>

      {revealed.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {revealed.map((nurse) => {
            const review = reviewsByNurse.get(nurse.user_id) ?? null;
            const hire = hiresByNurse.get(nurse.user_id) ?? null;
            return (
              <div key={nurse.user_id} className="space-y-3">
                <div className="relative">
                  <NurseCard nurse={nurse} showLastName />
                  {nurse.access_expires_at && (
                    <div className="absolute top-2 right-2 z-10">
                      <Badge
                        variant="outline"
                        className="border-amber-200 bg-amber-50 text-amber-900"
                      >
                        Access until{" "}
                        {new Date(nurse.access_expires_at).toLocaleDateString(
                          "en-US",
                          { month: "short", day: "numeric" },
                        )}
                      </Badge>
                    </div>
                  )}
                </div>
                <HireButton
                  nurseUserId={nurse.user_id}
                  nurseFirstName={nurse.first_name}
                  hire={hire}
                />
                <ReviewStateAction
                  nurseUserId={nurse.user_id}
                  nurseFirstName={nurse.first_name}
                  defaultFirstName={user.first_name ?? ""}
                  review={review}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="border-sage/20 mx-auto flex max-w-md flex-col items-center rounded-2xl border bg-white p-10 text-center">
      <div className="bg-teal/10 text-teal flex size-12 items-center justify-center rounded-full">
        <Eye className="size-6" aria-hidden="true" />
      </div>
      <h2 className="font-heading text-soft-black mt-4 text-lg font-medium">
        No reveals yet
      </h2>
      <p className="text-soft-black-light mt-2 text-sm">
        When you reveal a nurse&apos;s contact info, they&apos;ll show up here
        so you can come back and reach out anytime.
      </p>
      <Link
        href="/nurses"
        className="bg-teal hover:bg-teal-dark mt-5 inline-block rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
      >
        Find a nurse
      </Link>
    </div>
  );
}
