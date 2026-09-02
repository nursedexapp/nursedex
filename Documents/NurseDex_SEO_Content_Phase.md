# NurseDex SEO + Content Phase

A planning doc for the SEO and content marketing build. Captured from Tiana's Slack message (May 16, 2026) recommending an SEO content strategy after the bot tools she's been testing. **Not scheduled yet.** Belongs after Journey 1 ships.

Last updated: May 16, 2026

---

## Goal

Drive organic Google traffic to nursedex.com and capture leads (email addresses) from visitors who aren't ready to book a nurse yet. Tiana's framing: "Do NOT let visitors disappear."

Two distinct mechanisms:
1. **SEO surface area.** More indexable pages, structured around the terms families actually search (location, care type, role comparison).
2. **Lead capture.** Free downloadable PDFs (guides, checklists) gated by email so we can follow up with non converting visitors.

---

## Scope (Five Buckets)

### 1. Blog / Resources Section

Routes: `/resources`, `/care-guides`, `/blog` (need to decide whether these are three separate hubs or one hub with categories).

Article ideas from Tiana:
- What Type of Nurse Do I Need After Rehab?
- Overnight Dementia Care on Long Island
- Difference Between HHA and RN
- Questions to Ask Before Hiring a Private Nurse

Implies an ongoing editorial process, not a one time build.

### 2. Local Landing Pages

City and county pages built around "private nurse [location]" search intent. Tiana's examples:
- `/private-nurse-long-island`
- `/private-nurse-suffolk-county`
- `/private-nurse-nassau-county`
- `/overnight-care-smithtown-ny`
- `/dementia-care-huntington-ny`

These are template driven. One template, many slugs, each populated with location specific copy, nearby nurse cards, and FAQs scoped to that location.

### 3. Care Type Pages

Routes for each care type we support:
- `/post-surgical-care`
- `/dementia-care`
- `/overnight-care`
- `/wound-care`
- `/companion-care`
- `/pediatric-home-care`

Should pull from the same `care_type` enum the nurse profiles use, so adding a new care type to the system also creates a landing page.

### 4. FAQ Sections

Embedded on every template (blog, location, care type) and possibly as a standalone hub at `/faq`. Tiana's examples:
- What does a private nurse cost?
- Can an LPN give medications?
- Do HHAs stay overnight?
- What's the difference between CNA and HHA?

Must emit FAQ schema (JSON LD) for rich results.

### 5. Internal Linking

Every article and landing page links to:
- Related articles
- Care type pages
- Nurse profiles (filtered search results)
- City and county pages

Decision needed: manual editorial linking vs automated suggestion based on tags/slugs.

---

## Lead Magnets (Free Downloads)

From Tiana's second Slack message:
- "Get caregiving tips"
- "Download hospital discharge checklist"
- "Questions to ask before hiring a nurse"
- "I'd like to make it a downloadable free guide"

Each lead magnet:
- Lives on a dedicated landing page with its own SEO copy
- Asks for email (and optionally name + zip)
- Sends the PDF via Resend on form submit
- Adds the email to a "Resources" audience for future follow up
- Tracks conversion in PostHog

PDF source files need to be authored (probably by Tiana or a writer she hires). NurseDex builds the delivery system.

---

## Open Decisions

These need answers before building. Listed in priority order.

### Content Management
- **Where does content live?** Options: MDX in the repo (simplest, version controlled, no extra service), Sanity (Tiana can edit without touching code), Contentlayer, Notion as CMS via API, or Payload self hosted on Supabase.
- **Who writes?** Tiana? Outsourced writer? AI drafted and Tiana reviews?
- **Editorial cadence?** Weekly? Two per month? Sets the CMS workflow needs.
- **Author byline?** Single "NurseDex Team" byline or named authors with bio pages? Named authors are better for E E A T (Google's expertise signals) but require author pages.

### Lead Magnet Delivery
- **Email service.** Use Resend (already in stack, simple PDF attach via React Email) or add ConvertKit / Mailchimp for actual list management and sequences. Resend is fine for delivery, weaker for nurturing.
- **PDF hosting.** Static files in `/public` (no auth, but PDFs are findable if someone has the URL) vs Supabase Storage with signed URLs (gated, expires).
- **Where do emails go?** Separate Supabase table `lead_subscribers` vs existing `users` table with a `lead_only` flag. Separate is cleaner.
- **Double opt in?** Probably no (American norm is single opt in for B2C). Confirm with Tiana.

### Location Page Coverage
- **Which towns?** Long Island has ~150 named places. Top 30 by population? Every town in Nassau + Suffolk? Start with 10 highest search volume?
- **County pages.** Just Nassau and Suffolk, or also Queens / Brooklyn for the bordering zip coverage?
- **Combination pages.** `[care-type]-[location]` (like `/dementia-care-huntington-ny`) is a Cartesian product. 6 care types x 30 towns = 180 pages. Generate all or only high intent combos?

### Care Type Pages
- **Align with `care_type` enum?** Yes (recommended). Means adding a new care type also creates an SEO page.
- **Show live nurses?** Each care type page should embed a filtered nurse list ("Browse [care type] nurses on Long Island") with link to full search.

### FAQ
- **Standalone `/faq` hub?** Yes, mirrors competitor sites and ranks for "private nurse FAQ" type queries.
- **Per page FAQs.** Each location and care type page gets 5 to 8 scoped FAQs with schema.
- **Sourced from?** Tiana writes them, or pull from actual support@nursedex.com inbox questions over time.

### Internal Linking
- **Automated or manual?** Manual editorial links plus an automated "related" component that picks 3 articles by shared tag. Recommended hybrid.
- **Anchor text strategy.** Avoid "click here." Use descriptive anchors (Google ranks them).

### Technical SEO Hygiene
- **Sitemap.** Regenerate on every deploy. Next.js has built in support (`app/sitemap.ts`).
- **Robots.txt.** Already exists. Confirm it allows all the new routes.
- **Schema.** FAQ schema on FAQ blocks, Article schema on blog posts, LocalBusiness schema on city pages, Person schema on nurse profiles.
- **Open Graph images.** Each blog post and landing page needs an OG image. Generate at build time with `next/og`.
- **Canonical URLs.** Critical for location + care type combo pages to avoid duplicate content penalties.

---

## Rough Build Order

When this phase starts, suggested sequence:

1. **CMS decision and skeleton.** Pick MDX or Sanity, wire it up, ship one placeholder blog post live.
2. **Blog hub at /blog.** Listing page, post template, tag pages, RSS feed.
3. **Lead magnet system.** Build the form, Resend delivery, `lead_subscribers` table, one real downloadable PDF live.
4. **Care type pages.** Six pages, one per `care_type` enum value, template driven.
5. **Location pages.** Start with 10 high intent towns plus 2 counties.
6. **FAQ hub and per page FAQ blocks with schema.**
7. **Internal linking pass and sitemap audit.**
8. **Author bios and E E A T signals.**

Each step is one to two weeks of focused work. Total phase is ~8 to 12 weeks if dedicated.

---

## What This Does NOT Include

Things Tiana didn't ask for but might come up later:
- Newsletter / nurture sequences after lead magnet capture
- Paid Google Ads targeting the same keywords
- Backlink building / outreach
- Programmatic SEO at higher scale (every zip code in NY)
- Multi language (Spanish content for Long Island Spanish speakers)

Defer all of these until after the first organic results show what's working.
