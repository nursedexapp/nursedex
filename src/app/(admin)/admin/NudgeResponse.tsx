import type { NudgeResponse as Response } from "@/lib/nurses/nudge-response";

/**
 * Whether the two supply side sends moved anybody (#947).
 *
 * Presentational on purpose, like DirectoryCoverage beside it: it takes the
 * result already read, so the failure and the nothing-sent-yet states can be
 * rendered in a test without a database.
 */
export function NudgeResponse({ response }: { response: Response }) {
  return (
    <section className="mt-8">
      <h2 className="font-heading text-soft-black text-lg font-semibold">
        Did the nudges move anybody
      </h2>
      <p className="text-soft-black-light mt-1 text-sm">
        How many of the nurses we asked have since done the thing we asked for.
      </p>

      {response.ok ? (
        <div className="mt-3 space-y-3">
          {response.cohorts.map((cohort) => (
            <div
              key={cohort.emailType}
              className="border-sage/20 rounded-lg border p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-soft-black text-sm font-medium">
                  {cohort.label}
                </h3>
                {cohort.told > 0 && (
                  <span className="text-soft-black-light text-xs">
                    {describeWhen(cohort.firstSentAt, cohort.lastSentAt)}
                  </span>
                )}
              </div>

              {cohort.told === 0 ? (
                /* Nobody told is its own sentence. "0 of 0 have acted" reads
                   as the approach having failed rather than as a send that
                   has not happened. */
                <p className="text-soft-black-light mt-2 text-sm">
                  Nobody has been sent this yet, so there is nothing to measure.
                </p>
              ) : (
                <>
                  <p className="font-heading text-soft-black mt-2 text-2xl font-semibold">
                    {cohort.moved} of {cohort.told}
                  </p>
                  <p className="text-soft-black-light text-sm">
                    have {cohort.acted} since being asked.
                  </p>
                </>
              )}
            </div>
          ))}
          {/* Movement, not attribution. Each email only goes to nurses in the
              state it describes, so anybody out of that state has moved out of
              it since; what we cannot say is that the email is why. */}
          <p className="text-soft-black-light text-xs">
            These count who has moved since being asked, not who moved because
            of it.
          </p>
        </div>
      ) : (
        <div
          role="alert"
          className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900"
        >
          <p>
            {response.failed} could not be read, so these numbers are not being
            shown. They are unknown right now, not zero.
          </p>
          <p className="mt-1 font-mono text-xs">{response.message}</p>
        </div>
      )}
    </section>
  );
}

/**
 * When the send happened, as a reader would say it. A send that went out over
 * two days says so, because "asked on the 3rd" would be wrong for half of them.
 */
function describeWhen(first: string | null, last: string | null): string {
  if (!first || !last) return "";
  const from = day(first);
  const to = day(last);
  return from === to ? `Sent ${from}` : `Sent ${from} to ${to}`;
}

function day(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
