import Link from "next/link";
import type { Metadata } from "next";
import { Heart } from "lucide-react";
import { requireRole } from "@/lib/auth/helpers";
import { UserRole } from "@/types/enums";
import { NurseCard } from "@/components/nurses/NurseCard";
import { getSavedNurses } from "@/lib/nurses/saves";
import { hasActiveFamilyAccess } from "@/lib/subscriptions/queries";

export const metadata: Metadata = {
  title: "Saved Nurses | NurseDex",
};

export default async function SavedNursesPage() {
  const user = await requireRole(UserRole.FAMILY);
  const [saved, hasSub] = await Promise.all([
    getSavedNurses(user.id),
    hasActiveFamilyAccess(user.id),
  ]);

  const available = saved.filter((n) => n.is_available);
  const unavailable = saved.filter((n) => !n.is_available);

  return (
    <div className="mx-auto w-full max-w-5xl p-6 sm:p-8">
      <header className="mb-6">
        <h1 className="font-heading text-soft-black text-2xl font-semibold sm:text-3xl">
          Saved Nurses
        </h1>
        <p className="text-soft-black-light mt-1 text-sm">
          Your favorites in one place. Tap the heart on any profile to add or
          remove.
        </p>
      </header>

      {saved.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-10">
          {available.length > 0 && (
            <section>
              <h2 className="font-heading text-soft-black mb-4 text-lg font-medium">
                Accepting new clients
              </h2>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {available.map((nurse) => (
                  <NurseCard
                    key={nurse.user_id}
                    nurse={nurse}
                    showLastName={hasSub}
                    saveState={{ isSaved: true }}
                  />
                ))}
              </div>
            </section>
          )}

          {unavailable.length > 0 && (
            <section>
              <h2 className="font-heading text-soft-black mb-4 text-lg font-medium">
                Currently unavailable
              </h2>
              <p className="text-soft-black-light mb-4 text-sm">
                You&apos;ll still have access if they open their schedule again.
              </p>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {unavailable.map((nurse) => (
                  <NurseCard
                    key={nurse.user_id}
                    nurse={nurse}
                    showLastName={hasSub}
                    saveState={{ isSaved: true }}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="border-sage/20 flex flex-col items-center rounded-2xl border bg-white p-10 text-center">
      <div className="bg-teal/10 text-teal flex size-12 items-center justify-center rounded-full">
        <Heart className="size-6" aria-hidden="true" />
      </div>
      <h2 className="font-heading text-soft-black mt-4 text-lg font-medium">
        Nothing saved yet
      </h2>
      <p className="text-soft-black-light mt-2 max-w-md text-sm">
        Tap the heart on any nurse you&apos;d like to revisit. Your saved list
        syncs across devices, and you&apos;ll keep access even if they go
        unavailable.
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
