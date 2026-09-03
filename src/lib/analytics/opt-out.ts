import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * Has this person asked not to be tracked by analytics? (#715)
 *
 * Read with the service-role client on purpose: the callers are Stripe
 * webhooks and auth paths, where there is no end-user session to read the row
 * through. The only thing it reads is one boolean on one row, addressed by
 * primary key.
 *
 * FAILS CLOSED, and that is the whole design. This answer decides whether an
 * event goes to a third party, so the two ways of being wrong are not
 * equivalent: sending anyway means tracking somebody who may have refused,
 * losing an event means a gap in a chart. A control that exists to protect a
 * person takes the second one.
 *
 * That includes a user id with no row. No row is not "has not opted out", it
 * is a distinctId this lookup cannot speak for, and guessing in the sending
 * direction is the wrong guess.
 *
 * Failing closed is silent by nature: events just stop arriving. So every
 * refusal that came from a FAILURE rather than from a choice is logged, or a
 * broken lookup would be indistinguishable from an audience that went quiet.
 */
export async function hasOptedOutOfAnalytics(userId: string): Promise<boolean> {
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("users")
      .select("analytics_opt_out")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      // 42703 is Postgres for "no such column", and here it means one specific
      // thing: the code is live and migration 068 has not been applied yet.
      // Every server-side event stops until it is, which is this function
      // working as designed, but a generic "could not read" would send
      // somebody hunting through PostHog instead of running one command.
      if ((error as { code?: string }).code === "42703") {
        console.error(
          "[analytics-opt-out] users.analytics_opt_out is missing, so every " +
            "server-side event is being refused. Apply migration " +
            "068_analytics_opt_out.sql (npx supabase db push).",
          error,
        );
        return true;
      }
      console.error(
        "[analytics-opt-out] could not read the preference, treating as opted out",
        userId,
        error,
      );
      return true;
    }

    if (!data) {
      console.error(
        "[analytics-opt-out] no user row for this distinctId, treating as opted out",
        userId,
      );
      return true;
    }

    return data.analytics_opt_out === true;
  } catch (err) {
    console.error(
      "[analytics-opt-out] lookup threw, treating as opted out",
      userId,
      err,
    );
    return true;
  }
}
