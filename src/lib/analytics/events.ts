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
  FEATURED_UPGRADE: "featured_upgrade",

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
  SUBSCRIPTION_CANCELLED: "subscription_cancelled",

  // Reviews
  REVIEW_SUBMITTED: "review_submitted",
  EXTERNAL_REVIEW_LINK_CREATED: "external_review_link_created",
  REVIEW_DISPUTED: "review_disputed",

  // Hires
  HIRE_CLAIMED: "hire_claimed",
  HIRE_CONFIRMED: "hire_confirmed",

  // Waitlist
  WAITLIST_SIGNUP: "waitlist_signup",

  // General
  CONTACT_FORM_SUBMITTED: "contact_form_submitted",
  PAGE_VIEWED: "page_viewed",
} as const;
