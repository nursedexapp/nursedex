import { Card, CardContent } from "@/components/ui/card";
import type { DirectoryCoverage as Coverage } from "@/lib/nurses/coverage";

/**
 * How much of the verified roster families can actually see (#939).
 *
 * Presentational on purpose: it takes the result already read, so the failure
 * state can be rendered in a test without a database. The counts themselves
 * come from the directory's own filters (src/lib/nurses/coverage.ts).
 */
export function DirectoryCoverage({ coverage }: { coverage: Coverage }) {
  return (
    <section className="mt-8">
      <h2 className="font-heading text-soft-black text-lg font-semibold">
        Directory coverage
      </h2>
      <p className="text-soft-black-light mt-1 text-sm">
        How many verified nurses families can actually see.
      </p>

      {coverage.ok ? (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Stat label="Verified" value={coverage.verified} />
            <Stat
              label="Listed"
              value={coverage.listed}
              caption="Enough profile to show a family"
            />
            <Stat
              label="Searchable"
              value={coverage.searchable}
              caption="Returned by a default search"
            />
          </div>
          <p className="text-soft-black-light mt-3 text-sm">
            {coverage.unlisted === 0
              ? "Every verified nurse is listed."
              : `${coverage.unlisted} ${
                  coverage.unlisted === 1
                    ? "verified nurse is not listed"
                    : "verified nurses are not listed"
                }, so families cannot see ${
                  coverage.unlisted === 1 ? "her" : "them"
                }.`}
          </p>
          {!coverage.reconciles && (
            <p
              role="alert"
              className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
            >
              Listed ({coverage.listed}) and not listed ({coverage.unlisted}) do
              not add up to verified ({coverage.verified}). The two directory
              filters are meant to cover the same roster exactly, so one of them
              has drifted and some nurses are in neither.
            </p>
          )}
        </>
      ) : (
        <div
          role="alert"
          className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900"
        >
          <p>
            The {coverage.failed} count could not be read, so these numbers are
            not being shown. They are unknown right now, not zero.
          </p>
          <p className="mt-1 font-mono text-xs">{coverage.message}</p>
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  caption,
}: {
  label: string;
  value: number;
  caption?: string;
}) {
  return (
    <Card className="border-sage/20">
      <CardContent className="space-y-1 pt-5">
        <div className="text-muted-foreground text-xs">{label}</div>
        <p className="font-heading text-soft-black text-3xl font-semibold">
          {value}
        </p>
        {caption && <p className="text-soft-black-light text-xs">{caption}</p>}
      </CardContent>
    </Card>
  );
}
