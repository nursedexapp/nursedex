import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// Worst case ~2.25s (3 delays between 4 attempts), well under the default
// serverless timeout; not a background job, just a short bounded wait.
export const maxDuration = 10;

const POLL_ATTEMPTS = 4;
const POLL_DELAY_MS = 750;

/**
 * Stripe redirects here after a successful Checkout session. We don't trust
 * this redirect to grant access (the webhook does that), but the family can
 * land back on a page (e.g. the nurse profile they were revealing) and hit
 * the paywall again if our webhook hasn't processed checkout.session.completed
 * yet (#426). Briefly poll for the resulting subscription row before
 * redirecting; if it still hasn't landed, swap the celebration flag for a
 * "still provisioning" marker so the destination can show a working state
 * instead of a confusing repeat paywall.
 */
export async function GET(request: NextRequest) {
  const next = request.nextUrl.searchParams.get("next") ?? "/dashboard";
  const sessionId = request.nextUrl.searchParams.get("session_id");
  // Reject open-redirects: only allow same-origin paths.
  const safeNext =
    next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

  const provisioned = sessionId ? await waitForProvisioning(sessionId) : true;
  const finalUrl = provisioned ? safeNext : markPending(safeNext);

  return NextResponse.redirect(new URL(finalUrl, request.url));
}

async function waitForProvisioning(sessionId: string): Promise<boolean> {
  let subscriptionId: string | null;
  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    subscriptionId =
      typeof session.subscription === "string"
        ? session.subscription
        : (session.subscription?.id ?? null);
  } catch (err) {
    console.error("[checkout-success] session retrieve failed:", err);
    // Don't block the redirect on a Stripe API hiccup.
    return true;
  }
  if (!subscriptionId) return true;

  const supabase = createServiceRoleClient();
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    const { data } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("stripe_subscription_id", subscriptionId)
      .maybeSingle();
    if (data) return true;
    if (attempt < POLL_ATTEMPTS - 1) await sleep(POLL_DELAY_MS);
  }
  return false;
}

/** Suppress the premature celebration and flag that access is still catching up. */
function markPending(path: string): string {
  const [pathname, search = ""] = path.split("?");
  const params = new URLSearchParams(search);
  params.delete("subscribed");
  params.set("provisioning", "pending");
  return `${pathname}?${params.toString()}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
