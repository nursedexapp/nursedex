import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { unwrapCountOrThrow, unwrapOrThrow } from "@/lib/db/results";
export interface NewsletterRecipient {
  email: string;
  unsubscribe_token: string;
}

/** Confirmed, not-unsubscribed subscribers to send a newsletter issue to. */
export async function getConfirmedSubscribers(): Promise<
  NewsletterRecipient[]
> {
  const supabase = createServiceRoleClient();
  // A failed read is NOT "nobody is subscribed" (#1000). It hands the send an
  // empty recipient list, so the newsletter is delivered to nobody while the
  // job reports success, which is the fan-out failure in L120.
  const data = await unwrapOrThrow(
    supabase
      .from("newsletter_subscribers")
      .select("email, unsubscribe_token")
      .not("confirmed_at", "is", null)
      .is("unsubscribed_at", null),
    "the confirmed newsletter subscribers",
  );
  return (data ?? []) as NewsletterRecipient[];
}

/** Count of confirmed, not-unsubscribed subscribers (for the admin UI). */
export async function getConfirmedSubscriberCount(): Promise<number> {
  const supabase = createServiceRoleClient();
  // `count ?? 0` reads a failed count as a real zero (#847), and this one is
  // rendered as a number on an admin screen, so a database problem looks
  // exactly like an empty queue.
  return await unwrapCountOrThrow(
    supabase
      .from("newsletter_subscribers")
      .select("id", { count: "exact", head: true })
      .not("confirmed_at", "is", null)
      .is("unsubscribed_at", null),
    "the count of confirmed newsletter subscribers",
  );
}
