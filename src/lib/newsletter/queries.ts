import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export interface NewsletterRecipient {
  email: string;
  unsubscribe_token: string;
}

/** Confirmed, not-unsubscribed subscribers to send a newsletter issue to. */
export async function getConfirmedSubscribers(): Promise<NewsletterRecipient[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("newsletter_subscribers")
    .select("email, unsubscribe_token")
    .not("confirmed_at", "is", null)
    .is("unsubscribed_at", null);
  if (error) {
    console.error("[newsletter] getConfirmedSubscribers failed:", error.message);
    return [];
  }
  return (data ?? []) as NewsletterRecipient[];
}

/** Count of confirmed, not-unsubscribed subscribers (for the admin UI). */
export async function getConfirmedSubscriberCount(): Promise<number> {
  const supabase = createServiceRoleClient();
  const { count } = await supabase
    .from("newsletter_subscribers")
    .select("id", { count: "exact", head: true })
    .not("confirmed_at", "is", null)
    .is("unsubscribed_at", null);
  return count ?? 0;
}
