import type {
  UserRole,
  Credential,
  CareType,
  Skill,
  Gender,
  VerificationStatus,
  NurseTier,
  AvailabilityCommitment,
  TimeSlot,
  CommunicationPreference,
  SubscriptionStatus,
  ReviewStatus,
  HireStatus,
  AdminActionType,
  BlogPostStatus,
  BlogCommentStatus,
} from "./enums";

export interface User {
  id: string;
  email: string;
  role: UserRole | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  zip_code: string | null;
  communication_preference: CommunicationPreference | null;
  tos_accepted_at: string | null;
  tos_version: string | null;
  marketing_opt_out: boolean;
  is_deleted: boolean;
  is_suspended: boolean;
  created_at: string;
  updated_at: string;
}

export interface NurseProfile {
  id: string;
  user_id: string;
  slug: string;
  credential: Credential;
  license_number: string | null;
  care_types: CareType[];
  primary_care_type: CareType | null;
  skills: Skill[];
  gender: Gender | null;
  years_experience: number | null;
  languages: string[];
  bio: string | null;
  photos: string[];
  rate_min: number | null;
  rate_max: number | null;
  has_transportation: boolean;
  covid_vaccinated: boolean | null;
  care_philosophy: string | null;
  additional_certs: string[];
  availability_commitment: AvailabilityCommitment[];
  time_slots: TimeSlot[];
  travel_radius_miles: number | null;
  tier: NurseTier;
  verification_status: VerificationStatus;
  verification_rejected_reason: string | null;
  verified_at: string | null;
  is_available: boolean;
  unavailable_visibility: "hidden" | "badge" | null;
  profile_completeness: number;
  avg_rating: number | null;
  review_count: number;
  has_photo: boolean;
  is_seed: boolean;
  save_count_for_upsell: number;
  last_upsell_shown_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Shape of the onboarding wizard draft stored in localStorage */
export interface NurseProfileDraft {
  // Step 1: Basics
  first_name?: string;
  last_name?: string;
  gender?: string;
  years_experience?: number;
  languages?: string[];
  // Step 2: Credentials
  credential?: string;
  license_number?: string;
  care_types?: string[];
  primary_care_type?: string;
  // Step 3: Skills & Details
  skills?: string[];
  availability_commitment?: string[];
  time_slots?: string[];
  rate_min?: number;
  rate_max?: number;
  has_transportation?: boolean;
  covid_vaccinated?: boolean;
  care_philosophy?: string;
  additional_certs?: string[];
  // Step 4: Bio & Photos
  bio?: string;
  photos?: string[]; // storage paths, not URLs
  // Step 5: Contact
  contact_email?: string;
  contact_phone?: string;
  communication_preference?: string;
  zip_code?: string;
  travel_radius_miles?: number;
  // Meta
  completed_step?: number;
}

export interface FamilyProfile {
  id: string;
  user_id: string;
  zip_code: string | null;
  communication_preference: CommunicationPreference | null;
  survey_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  status: SubscriptionStatus;
  plan_type: "nurse_featured" | "family_access";
  billing_interval: "month" | "year";
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  access_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Reveal {
  id: string;
  family_user_id: string;
  nurse_user_id: string;
  revealed_at: string;
  access_expires_at: string | null;
}

export interface SavedNurse {
  id: string;
  family_user_id: string;
  nurse_user_id: string;
  saved_at: string;
}

export interface Hire {
  id: string;
  family_user_id: string;
  nurse_user_id: string;
  status: HireStatus;
  claimed_by: "family" | "nurse";
  claim_token: string | null;
  confirmed_at: string | null;
  created_at: string;
}

export interface Review {
  id: string;
  nurse_user_id: string;
  reviewer_name: string;
  reviewer_email: string | null;
  reviewer_user_id: string | null;
  rating: number;
  text: string | null;
  status: ReviewStatus;
  is_external: boolean;
  external_token: string | null;
  email_verified: boolean;
  testimonial_opt_in: boolean;
  nurse_response: string | null;
  nurse_response_at: string | null;
  dispute_reason: string | null;
  dispute_text: string | null;
  admin_decision: string | null;
  removal_requested: boolean;
  removal_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminAction {
  id: string;
  admin_user_id: string;
  action_type: AdminActionType;
  target_user_id: string | null;
  target_review_id: string | null;
  details: string | null;
  created_at: string;
}

export interface NurseAnalytics {
  id: string;
  nurse_user_id: string;
  date: string;
  profile_views: number;
  saves: number;
  reveals: number;
}

export interface EmailLog {
  id: string;
  recipient_user_id: string;
  email_type: string;
  dedup_key: string;
  sent_at: string;
}

export interface RateLimitReveal {
  id: string;
  family_user_id: string;
  date: string;
  reveal_count: number;
  captcha_triggered: boolean;
  consecutive_captcha_days: number;
}

export interface ZipCode {
  zip: string;
  county: string;
  latitude: number;
  longitude: number;
}

export interface LicenseVerificationUrl {
  credential: Credential;
  state: string;
  url: string;
  display_name: string;
}

export interface BlockedEmail {
  id: string;
  email: string;
  reason: string | null;
  blocked_at: string;
}

export interface ContactSubmission {
  id: string;
  name: string;
  email: string;
  message: string;
  is_read: boolean;
  admin_notes: string | null;
  created_at: string;
}

export interface SearchGapLog {
  id: string;
  filters: Record<string, unknown>;
  result_count: number;
  created_at: string;
}

export interface SlugRedirect {
  id: string;
  old_slug: string;
  new_slug: string;
  nurse_user_id: string;
  created_at: string;
}

/**
 * A Tiptap / ProseMirror document node. Stored as JSON in
 * blog_posts.content and rendered to React by src/lib/blog/render.tsx.
 */
export interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
}

export interface TiptapDoc {
  type: "doc";
  content?: TiptapNode[];
}

export interface BlogPost {
  id: string;
  author_id: string | null;
  title: string;
  slug: string;
  excerpt: string | null;
  content: TiptapDoc;
  cover_image_url: string | null;
  status: BlogPostStatus;
  publish_at: string | null;
  seo_title: string | null;
  seo_description: string | null;
  category_id: string | null;
  pinned: boolean;
  reading_time_minutes: number;
  created_at: string;
  updated_at: string;
}

export interface BlogCategory {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

export interface BlogTag {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

/** A post plus its resolved taxonomy, used for index/archive cards. */
export interface BlogPostListItem extends BlogPost {
  categoryName: string | null;
  categorySlug: string | null;
}

export interface BlogComment {
  id: string;
  post_id: string;
  author_name: string;
  author_email: string;
  body: string;
  status: BlogCommentStatus;
  created_at: string;
}

export interface BlogPostRevision {
  id: string;
  post_id: string;
  title: string;
  excerpt: string | null;
  content: TiptapDoc;
  created_by: string | null;
  created_at: string;
}
