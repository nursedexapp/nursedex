// The #projects-and-maintenance channel where all consulting requests
// live. Not secret, so kept in code rather than an env var. Plain module
// (no server-only) so both the server client and the view builders can
// import it.
export const OPS_CHANNEL_ID = "C0B8VPN6DMG";

// Dedicated channel for automated failure alerts (cron jobs, Stripe
// webhook failures, and future Sentry issue alerts), deliberately
// separate from OPS_CHANNEL_ID so these don't mix into the client-facing
// consulting/billing thread.
export const ALERTS_CHANNEL_ID = "C0BF7SEJ4J2";

// Dan (ops/dev) and Tiana (client) member IDs. Dan is tagged on every new
// request; both are tagged when a request is completed and on the monthly
// invoice. Empty = no tag (so the code is safe until an ID is filled in).
export const OPS_NOTIFY_USER_ID = "U0A6FV2R3FH";
export const CLIENT_NOTIFY_USER_ID = "U0A6R1LJWJX";

// Both parties, notified on completion and on the monthly invoice.
export const NOTIFY_USER_IDS = [
  OPS_NOTIFY_USER_ID,
  CLIENT_NOTIFY_USER_ID,
].filter(Boolean);

// Kept as an alias for the monthly invoice, which notifies the same parties.
export const INVOICE_NOTIFY_USER_IDS = NOTIFY_USER_IDS;
