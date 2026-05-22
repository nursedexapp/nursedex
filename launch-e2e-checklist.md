# NurseDex E2E Test Checklist

End to end manual test plan for the four launch journeys. Run all flows
in Stripe **test mode** before flipping to live. Use test cards
(`4242 4242 4242 4242`, any future expiry, any CVC, any ZIP) and
disposable email aliases so you can reuse your inbox.

## Setup (do once before starting)

- Have access to support@nursedex.com (super admin) in a separate
  browser profile
- Have a Gmail or alias inbox you can hit twice for verification emails
- Stripe Dashboard open in Test mode to watch webhooks
- Sentry and Vercel logs open to watch for errors during the runs

## Test card library

- Success: `4242 4242 4242 4242`
- Declined: `4000 0000 0000 0002`
- Requires 3DS: `4000 0025 0000 3155`
- Succeeds then fails on next renewal: `4000 0000 0000 0341`

---

## Journey 1: Nurse signup, onboard, verify, Featured, analytics

### Setup

- Fresh email alias for the nurse
- Have admin browser ready in a separate profile

### Steps

- [x] Open `/` (waitlist landing), click "I'm a caregiver" toggle (smoke
      test only, optional)
- [x] Open `/signup` (incognito), "Continue with email", submit alias
      and password
- [x] Land on `/signup/confirm`, check inbox, click confirmation link
- [x] Land on `/role-select`, choose **I'm a nurse**
- [x] Land on `/dashboard/onboarding`, walk through wizard:
  - Credential (e.g., RN), license number, care types (one or more),
    skills (three or more), languages
  - Years experience, gender, rates (rate_min less than or equal to
    rate_max)
  - Availability commitment, time slots, zip code, travel radius
  - Upload at least one photo and verify it appears in preview
  - Bio (two or three sentences)
  - Submit, profile saved with `verification_status='pending'`
- [x] Verify in DB: `nurse_profiles` row exists, `users.role='nurse'`,
      `users.first_name` and `users.last_name` set
- [x] **Switch to admin browser**, `/admin/verifications`, see this
      nurse in the queue
- [x] Click the nurse, review fields, **Approve**, confirm message
      appears
- [x] Back to nurse browser, reload `/dashboard`, "Verified" badge
      visible
- [x] Verify VerificationApproved email arrived in nurse's inbox
- [x] Click "Upgrade to Featured", Stripe Checkout opens
- [x] Pay with `4242 4242 4242 4242`, redirected back to `/dashboard`
- [x] Verify within five seconds: `nurse_profiles.tier='featured'`,
      `subscriptions` row inserted with `plan_type='nurse_featured'`,
      SubscriptionConfirmed email arrived
      (verified via /pricing flipping to "Manage subscription")
- [x] Confirm celebration: refund + cancel sub, retry upgrade, watch
      for confetti and the "Welcome to Featured" toast on landing
      (required two fixes: the checkout success URL double `?` that
      swallowed `upgraded=featured`, and a restyle of the loud toast)
- [x] Visit `/dashboard/analytics`, page loads (data may be all zeros,
      that's fine)
- [ ] Visit `/nurses` (incognito or logged out tab), confirm this nurse
      appears with **Featured** badge in the prioritized section
      (verifiable via the seed Featured nurses; the test nurse itself is
      currently free + `is_available=false` so it will not list)
- [ ] **Refund:** Stripe Dashboard, Payments, refund the test payment
      to clean up

### Pass criteria

- Verification approval email arrived
- Featured upgrade charged successfully and tier flipped within ten
  seconds
- Profile shows on `/nurses` with Featured badge
- No errors in Sentry or webhook logs

---

## Journey 2: Family survey, reveal, hire, review

### Setup

- Fresh email alias for the family
- One verified nurse exists in the system (use the one from Journey 1,
  or any seed nurse like `james-obrien-lpn`)

### Steps

- [ ] Open `/survey` (incognito), answer all four steps:
  - Care type, skills, location, availability and budget
  - Submit, land on `/survey/results` with matching nurses
- [ ] Click "Sign up to save these matches", `/signup` with `?survey=…`
      querystring
- [ ] Confirm a survey handoff cookie was set
- [ ] Submit signup, confirm email, `/role-select`, choose **I'm a
      family**
- [ ] Land on `/onboarding/family`, see survey filters auto applied
- [ ] Click through to `/nurses?from=survey`, see "Filters applied from
      your survey" banner
- [ ] Click on a nurse, land on `/nurses/[slug]`, contact section shows
      "Sign up free" or "Reveal" CTA depending on subscription state
- [ ] Click **Reveal contact**, Stripe Checkout opens
- [ ] Pay with `4242 …`, redirected back to the profile
- [ ] Verify: contact email and phone now visible, `subscriptions` row
      exists, `reveals` row exists with `access_expires_at` about sixty
      days out, SubscriptionConfirmed email (family copy) arrived
- [ ] Click **I hired this nurse**, fill confirmation modal, submit
- [ ] Verify `hires` row inserted, hire followup cron will eventually
      fire (don't wait, just confirm row exists)
- [ ] Wait for review prompt OR navigate to `/dashboard/reviews`, see
      prompt for a review
- [ ] Submit a review (rating, text, opt in to testimonial), submitted
      with `status='pending'`
- [ ] **Switch to admin**, `/admin/reviews`, Pending tab, approve the
      review
- [ ] Back to family, review now appears on the nurse's public profile
- [ ] Verify nurse's `avg_rating` and `review_count` updated

### Pass criteria

- Survey filters survived signup, land on `/nurses` with prefilled
  filters
- Reveal charged successfully and contact info appeared within five
  seconds
- Hire row recorded
- Review submitted, approved, and visible on public profile

---

## Journey 3: Admin verify and moderate

This overlaps with Journeys 1 and 2 above. Items not already covered:

### Steps

- [ ] **Login as super admin** at support@nursedex.com, `/admin`
- [ ] **Verifications**: confirm SLA badges show (Featured first, then
      FIFO within tier, with 75 percent and 100 percent red and yellow
      indicators if any nurse has been waiting longer than SLA)
- [ ] Try **Reject** on a pending nurse, confirm rejection reason field
      is required, submit, confirm VerificationRejected email arrived
- [ ] **Reviews, Pending**: approve and reject one of each. Confirm
      `nurse_profiles.avg_rating` recalculates after approve
- [ ] **Reviews, Removal requests**: have the reviewer (Journey 2
      family) submit a removal request for their own approved review,
      see it in this tab, approve removal
- [ ] **Disputes**: have the nurse (Journey 1) dispute a review,
      confirm "Under review" badge appears on the public profile,
      resolve via `/admin/disputes`, confirm adaptive email sent to the
      right party
- [ ] **Accounts**: search for the test family, click, **Suspend**,
      confirm sign out forced and paywall on access. Then
      **Unsuspend**, access restored
- [ ] **Accounts, Remove cascade**: pick a fully expendable test
      account, confirm cascade: Stripe subscription cancelled, soft
      delete on user row, blocked_emails entry, force sign out
- [ ] **Analytics** (super admin only): MRR, Signups, Engagement, Ops
      tabs all load and show non error states
- [ ] **Admins**: view the admin role list, confirm only
      support@nursedex.com is super_admin

### Pass criteria

- All four admin tabs load without RLS errors
- Reject reason gating works
- Suspend and unsuspend cycles work end to end
- Remove cascade actually cancels Stripe and soft deletes

---

## Journey 4: External review via shared link

### Setup

- A nurse with at least one revealed family hire (use the family and
  nurse from Journey 2)

### Steps

- [ ] **As nurse**, `/dashboard/reviews`, see "Share review link" card,
      click **Generate link**, copy the URL (format
      `nursedex.com/reviews/{token}`)
- [ ] Verify a `review_links` (or equivalent) row exists with the share
      token and TTL
- [ ] Open the link in **incognito or a non NurseDex inbox** (treat
      reviewer as a stranger):
  - [ ] Land on `/reviews/[token]`, see review form gated by email
        verification
  - [ ] Enter an email different from the family's account, submit
  - [ ] Receive verification email at that inbox, click the verify
        link, land on `/reviews/verify/[token]`
  - [ ] Submit rating and text, review created with `status='pending'`
- [ ] **As admin**, `/admin/reviews, Pending`, approve the external
      review
- [ ] Verify it now appears on the public profile WITHOUT requiring the
      reviewer to have a NurseDex account
- [ ] **Edge cases:**
  - [ ] Try to use the same token a second time, confirm rate limit or
        single use behavior
  - [ ] Wait until the share token TTL expires (or manually expire one
        in DB), confirm the link no longer works
- [ ] **As nurse**, click **Regenerate link**, confirm a new token is
      issued and the old one stops working

### Pass criteria

- Anyone with the link plus email verification can submit
- Token has a working TTL
- Regenerate invalidates the old token
- External reviews go through the same moderation queue and surface on
  the profile

---

## Findings and launch flips (discovered during testing)

Fixed in PRs off `main`:

- Featured celebration never fired: the Stripe `success_url` produced a
  double `?`, mangling `upgraded=featured`. Fixed (PR #52).
- Featured celebration toast was loud and jarring; restyled to a calm
  on-brand card (PR #53).
- "Upgrade to Featured" CTAs on `/dashboard/analytics` and in the
  UpgradeNudge email pointed at `/dashboard`, a dead end. Now route to
  `/pricing` (PR #56).
- Admins landed on `/dashboard` (empty for them) after login; now go to
  `/admin` (PR #51).
- Signup confirm screen now tells users to check spam (PR #54).
- Dashboard loading skeleton was nearly invisible; bumped contrast
  (PR #55). Same faint pattern still exists on `/nurses`, nurse profile,
  onboarding, and the signup confirm fallback (follow up).

Still open, decide before launch:

- Waitlist front door: `/` (the waitlist landing) renders no nav, so a
  logged out visitor has no path into the product (`/nurses`, `/welcome`,
  and so on). At launch, repoint `/` to the real home or add nav.
- Email deliverability: confirmation emails landed in spam. Verify the
  sending domain SPF, DKIM, and DMARC in Resend.
- Nurse availability defaults to `false`: a freshly onboarded, verified
  nurse does not appear on `/nurses` until they toggle "available."
  Confirm this is intended or set a sensible default.
- Header "Find a Nurse" shows to logged in nurses too, who have no reason
  to browse nurses. Consider audience scoping like `/pricing`.
- `/brand/*` design sandbox routes are publicly reachable with
  non-functional demo buttons. Add `noindex` or gate them.

## Final smoke checklist (pre launch)

- [ ] Sign in and sign out cycle for all three roles works
- [ ] Forgot password, reset, sign in works
- [ ] Google OAuth path works for at least one role
- [ ] No console errors on `/`, `/welcome`, `/nurses`, `/signup`,
      `/login` during the runs
- [ ] No Sentry errors logged from these flows
- [ ] All Stripe test charges refunded so the test ledger is clean
      before flipping to live
