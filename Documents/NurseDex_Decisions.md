# NurseDex Decisions Reference

All product, technical, and policy decisions made during planning. This is the companion to the implementation plan.

---

## Tech Stack
- **Auth + DB:** Supabase (single service), Free plan for now (upgrade to Pro before launch for PITR backups + custom domain so Google OAuth shows nursedex.com instead of the Supabase URL), one project with database branching. Project ID: `fisuhtkzhyttdmqoivlp`. Uses new API key format: publishable key (`sb_publishable_...`) for client, secret key (`sb_secret_...`) for server.
- **UI:** shadcn/ui themed to NurseDex brand tokens
- **Payments:** Stripe Checkout (hosted page, not embedded)
- **Images:** Supabase Storage (private bucket, signed URLs, 4hr TTL), client-side resize to 1200px, 5MB cap, jpg/png/webp only, magic byte validation server-side
- **Email:** Resend, set up in Phase 0, templates built per phase with react-email
- **Analytics:** PostHog (product), Sentry (errors), both from Phase 0
- **CAPTCHA:** Cloudflare Turnstile
- **Distance:** Zip code lookup table (SimpleMaps data, Nassau + Suffolk + bordering Queens) with Haversine in Postgres
- **Cron:** Vercel Cron via `vercel.ts` (`@vercel/config`), all verify CRON_SECRET, UTC times
- **Testing:** Vitest (unit/business logic) + Playwright (E2E)
- **Linting:** ESLint + Prettier (with Tailwind plugin) from Phase 0

## Infrastructure
- **Hosting:** Vercel (Pro plan), nursedex.com
- **Local dev:** Docker Desktop + Supabase CLI (`supabase start`)
- **Git workflow:** Feature branches, merge to main when ready. No PR ceremony. Vercel preview deploys per branch.
- **Migration workflow:** Write locally, test with `supabase start`, push via `supabase db push`
- **Supabase custom SMTP:** Through Resend, all auth emails from noreply@nursedex.com
- **Email inbox:** support@nursedex.com (ImprovMX or Google Workspace, needs setup)

## Nurse Profiles
- **Onboarding:** 5-step wizard. localStorage draft, DB save on completion.
- **Tier limits:** Free: 150-char bio, 1 photo, 2 care types. Featured: 500-char bio, 3 photos, unlimited.
- **Downgrade:** Force trim to free limits before profile goes live again.
- **Tier field:** `tier` enum (free/featured) not boolean. Ready for premium ($49/mo) later.
- **Primary care type:** Explicit field, nurse picks during onboarding if multiple selected.
- **Availability:** Two structured multi-selects. Commitment: Full-time/Part-time/Per diem/Live-in. Time slots: Weekdays/Weekends/Evenings/Overnights/On-call/Flexible.
- **Profile completeness:** 0-100% of optional fields only. Required fields must be filled to publish. Per-field prompts.
- **"Accepting new clients" toggle:** Featured nurses get dialog: hide from search OR stay visible with badge. Store as `unavailable_visibility`.
- **Slug:** Auto-generated from name + credential, unique. On name change: regenerate + 301 redirect from old slug.
- **License display:** Profession, state, license number, "Verify on NY State database" link, disclaimer.
- **Upsell toast:** First 3 profile saves, pause 30 days, reset counter.
- **Share button:** Copy-to-clipboard slug URL on dashboard.
- **Search card preview:** Nurse can see how their card appears in search.

## Family Features
- **Survey:** Must-have for launch. Works before signup (Path A). Shows partial nurse cards (first name, credential, photo, star rating).
- **Survey handoff:** Carry answers as URL params after signup + "We applied your preferences" prompt.
- **Search state:** URL params (shareable, bookmarkable, survives refresh).
- **Search pagination:** Offset with page numbers, 15 per page.
- **Availability filter:** ALL matching by default. "Partial matches" section when thin results. ANY as explicit toggle.
- **Gender filter:** "Any" includes "Prefer not to say"; specific filters exclude them.
- **Zero results:** Show partial matches + flag gap in admin analytics.
- **Mobile filters:** Sheet/drawer. Desktop: sidebar.
- **Search count:** "X nurses found" at top.
- **Search route:** `/nurses` (REST resource index; profiles at `/nurses/[slug]`).
- **Partial matches threshold:** Show partials when fewer than 10 total full matches; fill page to 15 with partials. Partials only on page 1.
- **Partial matches relaxation order:** Relax location first (drop distance filter), then availability (commitment + time slots + show-unavailable). Nothing else is relaxed.
- **Partial matches label:** "Other nurses you might consider".
- **Save button:** Heart icon on NurseCard (family role only). Anon viewers do not see the heart. Saved nurses page at `/dashboard/saved`, includes unavailable nurses.
- **Filter UI inputs:** Native `<select>` for single-value fields (credential, care type, gender, distance) to avoid Base UI Select API churn. Checkboxes for multi-select (skills, languages, availability, time slots).
- **Search indexes:** GIN indexes on skills/languages/care_types/availability_commitment/time_slots array columns; partial btrees on scalar filters (migration 008).
- **Paywall UX:** Modal with value prop, price, cancellation policy, 60-day window, "Subscribe" CTA.
- **Contact links:** Pre-filled mailto (subject + body placeholder), tel, sms (body placeholder).
- **Reveal rate limiting:** Turnstile CAPTCHA at 10+/24hr, hard cap 25, flag 3+ consecutive CAPTCHA days.
- **60-day window:** Cancelled families see revealed nurses with "Access until [date]".

## Reviews
- **External reviews:** UUIDv4 token link, cap 5 pending per nurse, email verification required.
- **Editing:** Editable while pending. Locked after approval.
- **Removal:** Family can request removal, goes to admin queue.
- **Disputes:** Formal flow. Nurse clicks "Dispute" with reason. `disputed` status. Admin reviews. Decision emailed to both. Disputed reviews remain visible during investigation.
- **Profanity filter:** `leo-profanity` npm package. English only.
- **Testimonial opt-in:** Checkbox on 4-5 star reviews.
- **On family deletion:** Reviews preserved with first name.

## Payments
- **Stripe Checkout** for both tiers. Customer Portal for management.
- **Featured + Pending:** Allow payment before verification with warning.
- **Payment failure:** 3-day grace period, then downgrade. In-app banner for families.
- **Webhooks:** Must be idempotent, handle out-of-order and duplicates.
- **Source of truth:** `subscriptions` table. `tier` on nurse_profiles is denormalized. Webhook + reconciliation cron keep in sync.
- **Stripe portal branding:** Customize to NurseDex colors/logo.
- **Revenue reporting:** Stripe API (accurate, includes refunds).

## Admin
- **First admin:** Manual DB insert for super_admin after normal signup.
- **Suspend:** Temporary freeze (reversible). Profile hidden, everything else stays.
- **Remove:** Permanent soft delete + block email + cancel Stripe. Existing reveals stay within window.
- **SLA alerts:** Email admins at 75% of SLA (18hr Featured, 54hr Free). Overdue badge.
- **Verification celebration:** Modal on nurse's next login after approval.
- **Analytics:** Fixed period tabs + date range picker. Revenue via Stripe API.
- **Data export:** Use Supabase dashboard, no custom CSV.
- **Contact inbox:** Admin panel page + notification to support@nursedex.com.

## Auth + Accounts
- **Signup:** Email/password + Google OAuth. ToS checkbox with timestamp + version.
- **Password:** Minimum 8 characters.
- **Session:** 1hr access token, 7-day refresh token.
- **Blocked emails:** Removed accounts cannot re-register.
- **Soft delete:** Mark `is_deleted`, hide from search, preserve data.
- **Server Actions:** Every mutation must call `requireAuth()` / `requireRole()` internally.

## Email
- **From name:** "NurseDex Team". Reply-to: support@nursedex.com.
- **Shared layout:** EmailLayout wrapper with teal header, logo, DM Sans, footer with unsubscribe + physical address.
- **Opt-outs:** Users can only opt out of marketing/upsell. Transactional always sent.
- **CAN-SPAM:** One-click unsubscribe in all marketing emails. Physical address TBD (PO Box or registered agent before launch).
- **Batching:** Cron jobs batch sends with delays for Resend rate limits.
- **Dedup:** `email_log` table with key: (recipient_id, email_type, dedup_window).
- **Reveal notification:** Semi-anonymous. "Someone in your area revealed your profile."

## SEO
- **Public profiles:** Limited view without login (name, credential, care types, photo, rating).
- **Slugs:** SEO-friendly `/nurses/sarah-chen-rn`.
- **OG images:** Dynamic for homepage and nurse profiles.
- **JSON-LD:** schema.org Person on nurse profiles.
- **robots.txt:** Block /admin, /api, /auth. Allow /nurses/* and static pages.
- **Sitemap:** Public nurse profiles + static pages.

## Content
- **Copy approach:** Placeholder during development. Full polish pass in Phase 10.
- **Static pages:** Claude helps draft content in Phase 9.
- **Consistent term:** "Accepting new clients" everywhere.
- **License disclaimer:** On nurse profiles AND during family onboarding.
- **Subscription page:** Explicit pricing, auto-renewal, cancellation policy, 60-day window.

## Monitoring
- **PostHog events:** Defined upfront (signup, onboarding, search, profile_viewed, saved, reveal, subscription, review, hire, survey, featured_upgrade).
- **Search demand:** Track all search queries via PostHog for demand trend analytics.
- **Search gaps:** Log zero/low results to `search_gap_log` for admin market intelligence.

## Seed Data
- **Demo profiles:** 15-20 realistic nurse profiles. `is_seed` flag. Not revealable except by Super Admins and tests.
- **Zip codes:** SimpleMaps dataset, Nassau + Suffolk counties + bordering Queens. ~200-250 records.

## Future / Not Built for Launch
- **Region scoping:** Distance filter handles it. Add region logic when multi-state expansion planned.
- **Premium tier ($49/mo):** Enum ready. Build when demand warrants.
- **In-app notifications:** Email only for now.
- **Nurse comparison view:** Not built.
- **Data export in admin panel:** Use Supabase dashboard.

## Policy (Decided)
- **Price changes:** New price at next renewal. 30-day advance notice email.
- **Review disputes:** Formal flow (dispute button, admin reviews, decision emailed to both).
- **Independent contractor disclaimer:** In ToS. NurseDex is directory, not employer/agency.

## Business Entity
- **LLC:** NurseDex LLC (already set up)
- **Physical address:** 2197 Louis Kossuth Avenue, Ronkonkoma, NY 11779 (used for CAN-SPAM email footer and any legal/business filings)
- **Refund policy:** No refunds. Subscription grants access to reveal contact info. NurseDex does not guarantee outcomes. Clear in ToS. Family can cancel anytime to stop future billing.
