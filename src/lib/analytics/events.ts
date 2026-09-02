// PostHog event names. Use these instead of raw strings
// to keep analytics consistent across the codebase.

export const ANALYTICS_EVENTS = {
  // Auth
  SIGNUP_STARTED: "signup_started",
  SIGNUP_COMPLETED: "signup_completed",
  LOGIN: "login",
  ROLE_SELECTED: "role_selected",

  // Nurse
  ONBOARDING_STARTED: "onboarding_started",
  ONBOARDING_STEP_COMPLETED: "onboarding_step_completed",
  ONBOARDING_COMPLETED: "onboarding_completed",
  PROFILE_UPDATED: "profile_updated",
  PHOTO_UPLOADED: "photo_uploaded",
  AVAILABILITY_TOGGLED: "availability_toggled",
  FEATURED_UPSELL_SHOWN: "featured_upsell_shown",
  FEATURED_UPSELL_CLICKED: "featured_upsell_clicked",

  // Family
  SURVEY_STARTED: "survey_started",
  SURVEY_COMPLETED: "survey_completed",
  SEARCH_PERFORMED: "search_performed",
  PROFILE_VIEWED: "profile_viewed",
  NURSE_SAVED: "nurse_saved",
  NURSE_UNSAVED: "nurse_unsaved",
  REVEAL_ATTEMPTED: "reveal_attempted",
  REVEAL_COMPLETED: "reveal_completed",
  SUBSCRIPTION_STARTED: "subscription_started",
  // Completed/cancelled fire server-side from the Stripe webhook (the only
  // reliable place: a buyer may never return from Stripe's checkout page).
  SUBSCRIPTION_COMPLETED: "subscription_completed",
  SUBSCRIPTION_CANCELLED: "subscription_cancelled",

  // Reviews
  REVIEW_SUBMITTED: "review_submitted",
  // Renamed from external_review_link_created when it was first wired:
  // the link is not created on demand, it is derived from the nurse slug
  // and always exists, so "created" named a moment that never happens.
  // Sharing it is the real act, and it had never fired, so no history
  // was lost in the rename.
  EXTERNAL_REVIEW_LINK_SHARED: "external_review_link_shared",
  REVIEW_DISPUTED: "review_disputed",

  // Hires
  HIRE_CLAIMED: "hire_claimed",
  HIRE_CONFIRMED: "hire_confirmed",

  // Blog
  BLOG_POST_VIEWED: "blog_post_viewed",

  // Homepage. Seen as well as clicked, because a visitor who never reached the
  // button and one who reached it and ignored it are indistinguishable
  // otherwise, and they point at different fixes (#869).
  HOMEPAGE_CTA_SEEN: "homepage_cta_seen",
  HOMEPAGE_CTA_CLICKED: "homepage_cta_clicked",

  // General
  CONTACT_FORM_SUBMITTED: "contact_form_submitted",
  // page_viewed was deliberately DELETED rather than wired (#864).
  // PostHogProvider already fires PostHog's own $pageview on every route
  // change, so a second name here would be a rival count of the same thing,
  // and two numbers for one fact is worse than one.
} as const;
