// The #projects-and-maintenance channel where all consulting requests
// live. Not secret, so kept in code rather than an env var. Plain module
// (no server-only) so both the server client and the view builders can
// import it.
export const OPS_CHANNEL_ID = "C0B8VPN6DMG";

// Dan's Slack member ID, tagged on every new request so he gets pinged.
// Empty = no tag (so the code is safe until the ID is filled in).
export const OPS_NOTIFY_USER_ID = "U0A6FV2R3FH";

// Tagged on the monthly invoice (Dan + Tiana) when there are billable
// hours. The invoice does not post at all when there are none.
export const INVOICE_NOTIFY_USER_IDS = [OPS_NOTIFY_USER_ID, "U0A6R1LJWJX"].filter(
  Boolean,
);
