// Pricing
export const PRICING = {
  NURSE_FEATURED_MONTHLY: 29,
  FAMILY_ACCESS_MONTHLY: 9.99,
  // Annual Family Access. Standard renewal price is FAMILY_ACCESS_ANNUAL; the
  // first year is discounted to FAMILY_ACCESS_ANNUAL_FIRST_YEAR via a Stripe
  // coupon (see STRIPE_FAMILY_ACCESS_ANNUAL_COUPON_ID).
  FAMILY_ACCESS_ANNUAL: 99,
  FAMILY_ACCESS_ANNUAL_FIRST_YEAR: 39.99,
} as const;

// Tier limits
export const TIER_LIMITS = {
  free: {
    bioMaxLength: 150,
    maxPhotos: 1,
    maxCareTypes: 2,
  },
  featured: {
    bioMaxLength: 500,
    maxPhotos: 3,
    maxCareTypes: Infinity,
  },
} as const;

// Rate limits.
//
// The cap and captcha threshold are ENFORCED IN THE DATABASE, by
// consume_reveal_rate_limit (migration 054). Changing a number here does not
// change what the database allows; it needs a matching migration. The
// live-database tests in src/lib/__tests__/db-guards.test.ts assert the two
// agree, so a change to one without the other fails CI rather than silently
// doing nothing.
//
// Reveals reset at midnight UTC (the functions key on CURRENT_DATE), not on a
// rolling 24-hour window.
export const RATE_LIMITS = {
  REVEALS_CAPTCHA_THRESHOLD: 10,
  REVEALS_HARD_CAP: 25,
  CONSECUTIVE_CAPTCHA_DAYS_FLAG: 3,
} as const;

// Grace periods
export const GRACE_PERIODS = {
  PAYMENT_FAILURE_DAYS: 3,
  CANCELLED_ACCESS_DAYS: 60,
} as const;

// Photo upload
export const PHOTO_UPLOAD = {
  MAX_SIZE_BYTES: 5 * 1024 * 1024, // 5MB
  MAX_DIMENSION_PX: 1200,
  ALLOWED_TYPES: ["image/jpeg", "image/png", "image/webp"] as const,
  SIGNED_URL_TTL_SECONDS: 4 * 60 * 60, // 4 hours
} as const;

// Search
export const SEARCH = {
  RESULTS_PER_PAGE: 15,
} as const;

// Session
export const SESSION = {
  ACCESS_TOKEN_LIFETIME_SECONDS: 3600, // 1 hour
  REFRESH_TOKEN_LIFETIME_DAYS: 7,
} as const;

// Reviews
export const REVIEWS = {
  MAX_PENDING_EXTERNAL: 5,
  NURSE_RESPONSE_MAX_LENGTH: 500,
} as const;

// Upsell
export const UPSELL = {
  SAVES_BEFORE_TOAST: 3,
  PAUSE_DAYS: 30,
} as const;

// Verification SLA (in hours)
export const VERIFICATION_SLA = {
  FEATURED_HOURS: 24,
  FREE_HOURS: 72,
  ALERT_THRESHOLD: 0.75, // alert at 75% of SLA
} as const;

// Profile completeness weights (must total 100)
export const COMPLETENESS_WEIGHTS = {
  photo: 15,
  bio: 15,
  skills: 10,
  care_philosophy: 10,
  availability_commitment: 10,
  time_slots: 5,
  rate: 10,
  has_transportation: 5,
  covid_vaccinated: 5,
  additional_certs: 5,
  travel_radius_miles: 5,
  languages_extra: 5, // beyond default "English"
} as const;

// Password
export const PASSWORD = {
  MIN_LENGTH: 8,
} as const;

// Password recovery: a short-lived marker cookie set by /auth/callback only
// when arriving via a valid password-reset link. The /reset-password page and
// its action require it, so a plain authenticated session (e.g. navigating
// there directly while logged in) cannot change the password.
export const PASSWORD_RECOVERY = {
  COOKIE_NAME: "nursedex_pw_recovery",
  TTL_SECONDS: 15 * 60, // 15 minutes
} as const;

// Physical address (CAN-SPAM)
export const BUSINESS_ADDRESS = {
  line1: "2197 Louis Kossuth Avenue",
  city: "Ronkonkoma",
  state: "NY",
  zip: "11779",
} as const;

// Public social profiles. Canonical URLs only (no share/QR tracking params).
// Update the Facebook URL to the vanity handle once a username is set on the Page.
export const SOCIAL_LINKS = {
  facebook: "https://www.facebook.com/profile.php?id=61575387869793",
  instagram: "https://www.instagram.com/nursedexcommunity",
  linkedin: "https://www.linkedin.com/company/nursedex/",
} as const;
