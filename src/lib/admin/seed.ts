/**
 * Demo nurse accounts seeded to populate the directory (see
 * scripts/seed-demo-nurses.ts) share this email prefix and carry
 * nurse_profiles.is_seed = true. They are real rows kept so the directory
 * isn't empty, but they must never read as real signups, so admin and
 * analytics surfaces filter them out by this pattern.
 */
export const SEED_EMAIL_PATTERN = "noreply+seed-%@nursedex.com";
