# How the directory actually works, measured

Facts about the nurse directory, its ranking, its caching posture and its analytics, each measured
against this repo or the live database on **5 September 2026** and each naming where it was checked.

They were produced by a planning exercise for a homepage rebuild that was **dropped** (see #980 for
why). The plan is gone; these measurements are not, because they describe the system rather than the
proposal. Anything below is a reading from one day: re-check before relying on a number, and treat a
`path:line` as a pointer rather than a promise.

| Claim | Verified where |
|---|---|
| The homepage forks three times: `Hero` (two cards), `DualHowItWorks`, `FinalCTAs` | `src/app/(public)/page.tsx:36-38, :191, :296` |
| Anonymous cards are blanked in the DATA, not in markup | `src/lib/nurses/card.ts:192` (last_name) and `:213-220` (bio, rate_min, rate_max, availability_commitment) |
| `canSeeDetails` is exactly `viewerIsSignedIn` | `src/lib/nurses/search.ts:110` |
| **`rankingScore`'s real order with a resolved origin is: featured-and-in-range, name match, placeable, distance, photo, comm-pref, quality** | `src/lib/nurses/search-ranking.ts` (the `if (!distance?.originResolved)` branch and the tuple below it) |
| `DISTANCE_RANKING_CRITERIA` is currently `["the closest nurses", "featured nurses near you", "nurses whose name matches your search" (conditional), "more complete profiles"]`. So the sentence is wrong in TWO places, not one: Featured is missing from the front, and the name match outranks distance | `src/lib/nurses/search-ranking.ts` |
| Two tests currently DEFEND that reversed sentence | `search-ranking.test.ts:97` ("describes the zip order as closest first"), `results-summary-copy.test.ts:136` ("names what actually comes first once a zip is placed", asserting `/^The closest nurses first/`) |
| `orderSentence(orderedByDistance, sort)` takes no knowledge of the RESULTS; it reads the criteria list only | `src/components/nurses/results-summary-copy.ts:24-39` |
| `tier` is a public card key, so a caption CAN be derived from the returned set | `src/lib/nurses/card.ts:376` in `PUBLIC_NURSE_CARD_KEYS`. Note `:107` is `tier` inside `NURSE_CARD_ROW_KEYS`, the columns the shaper READS, which is a different list |
| **There are ZERO Featured nurses in production.** 0 of 58 listed, 0 of 76 visible and verified | live PostgREST query, 2026-09-05, committed as `analytics/roster.2026-09-05.md` |
| The roster: **76** visible and verified, **58** listed, all 58 with a photo. **37 of the 58 have a rate on file**, so 37 hero cards would read "Log in to see rate and availability" and 21 would read "Log in to see availability" | same query; `lockedFooterLabel` at `src/components/nurses/nurse-card-copy.ts:52-60` |
| A malformed zip is swallowed: `z.string().regex(/^\d{5}$/).optional().catch(undefined)` | `src/lib/nurses/search-params.ts:135` |
| `useApplyFilters` calls `router.replace` on `/nurses`, and `PostHogProvider`'s tracker fires `$pageview` on `[pathname, searchParams]`, so every filter change is a same-path recapture | `src/components/nurses/useApplyFilters.ts:47`, `src/components/PostHogProvider.tsx` |
| The pending primitive already ships: `usePendingPhase` at `src/components/ui/pending-button.tsx:70`, idle/working/slow/stalled, timers outside the transition | `src/components/ui/pending-button.tsx` |
| `proxy.ts` awaits `updateSession` (a Supabase `auth.getUser` round trip) on every request matching the matcher, including `/` | `src/proxy.ts` |
| `proxy.ts` already mints a per request value and forwards it to the render by building `requestHeaders` and constructing a `new NextRequest(request, { headers: requestHeaders })` BEFORE awaiting `updateSession` | `src/proxy.ts` (the `x-nonce` block) |
| **`updateSession` REASSIGNS its response inside `setAll`** (`supabaseResponse = NextResponse.next({ request })`), so any cookie set on a response before the await is destroyed on exactly the requests where Supabase refreshes a token | `src/lib/supabase/middleware.ts` |
| **The homepage document is already dynamic and stays dynamic**: `(public)/layout.tsx` renders `<Header/>`, which awaits `getCurrentUser()`, which reads cookies. `cacheComponents` is off, so a cookie read anywhere in the tree opts the whole route out of prerendering | `src/app/(public)/layout.tsx`, `src/components/shared/Header.tsx`, `src/lib/auth/helpers.ts`, `next.config.ts` |
| There is no caching anywhere in `src`: zero `unstable_cache`, `"use cache"`, `revalidateTag` outside a test mock | grep across `src` |
| `unstable_cache` IS exported by the installed `next/cache`, alongside `revalidateTag`, `cacheLife`, `cacheTag` | `node -e` against `node_modules/next/cache.js` |
| **The installed Next is 16.2.3 while `package.json` asks for `^16.3.4`**, so the tree does not satisfy its own range. Everything here was measured against 16.2.3; a fresh `npm ci` installs something else | `node_modules/next/package.json` vs `package.json:60` |
| The prerender manifest holds exactly `/_global-error`, `/apple-icon`, `/blog/feed.xml`, `/favicon.ico`, `/robots.txt`, `/sitemap.xml`, and `dynamicRoutes` is EMPTY. **Seven** files declare `revalidate`, and **two of them are already prerendered** | `.next/prerender-manifest.json`, `grep "export const revalidate" src` |
| Of the five declaring `revalidate` and absent from the manifest, four (`blog/page.tsx`, `blog/category/[slug]`, `blog/author/[id]`, `blog/tag/[slug]`) await `searchParams` or are dynamic segments, and there is **no `generateStaticParams` anywhere in `src/app`** | grep across `src/app` |
| **Nothing in CI ever runs `next build`.** `.github/workflows/ci.yml` runs the merged-tree proof, lint, the db-error ratchet, typecheck, `npm test`, the vitest cache check and guard-mutation. `.next/` is gitignored (`.gitignore:5`). Vercel builds separately. Production promotion is GATED by `.github/workflows/promote.yml` since #817, so a failing build leaves nothing to promote and fails every preview too | `.github/workflows/ci.yml`, `.gitignore` |
| `npm run build` is exactly `next build`, and Vercel uses it | `package.json:8` |
| `attachNurseCardPhotos` does NO Supabase call: `nursePhotoUrl` is a pure token builder (#871 already landed), it takes **no viewer argument**, and on failure it **catches per card, sets `photo_url = null` and `console.error`s** rather than throwing | `src/lib/nurses/card.ts:453-477` |
| **`searchNurses` runs `enrichWithLocation` (`search.ts:120`, defined `:415`), which calls `applyTowns` (`:430`) to fill `city` and `state` on every card from one zip lookup.** Without it `townLabel` returns null and a card shows no location | `src/lib/nurses/search.ts`, `src/components/nurses/nurse-card-copy.ts:103` |
| `attachNurseCardTowns` is already exported (`card.ts:570`) and already used outside search, by `saves.ts:188` and `reveals/queries.ts:165` | grep across `src` |
| `runQuery` is PRIVATE (declared `src/lib/nurses/search.ts:210`, not exported) and does the shaping itself at `:339` | `src/lib/nurses/search.ts` |
| `searchNurses` finishes with `attachNurseCardPhotos` then `toPublicNurseCard` at `:178-184`. Skipping those leaves `photo_url` null on every card | `src/lib/nurses/search.ts` |
| `hitResultCap` is computed at `search.ts:188` and **read by nobody** | grep: definition at `:45`, assignment at `:188`, no consumer |
| `is_hidden` has **no write path anywhere in `src`** (reads only) | grep across `src` |
| **`review_count` and `avg_rating` are maintained by a DATABASE TRIGGER**, `recalculate_nurse_rating()` on `AFTER INSERT OR UPDATE OF status, rating OR DELETE ON public.reviews` | `supabase/migrations/003_functions.sql:107-131` |
| `getJobHealth` builds rows by pairing `job_heartbeats` with `scheduledCrons` from `vercel.json`, and the heartbeat route's own docstring says names come from `vercel.json` "never from the caller". **It cannot hold a record for anything that is not a scheduled cron** | `src/lib/admin/job-health.ts`, `src/app/api/internal/job-heartbeats/route.ts` |
| `hasOptedOutOfAnalytics` fails closed, so an anonymous server side event never fires | `src/lib/analytics/server.ts` |
| **There are TWO independent `alertOpsSlack` functions**, one at `src/lib/cron/alerting.ts:97` (called `:79`, `:89`, inside `withCronAlerting`) and a second, unrelated one at `src/app/api/stripe/webhook/route.ts:106` (called `:96`). Same name, different signature, either side of a boundary. Project memory records the bot is valid but **not a channel member, so no alert from either has ever been delivered** | grep across `src`, project memory |
| `TrackedCta` requires `audience: "families" \| "nurses"` (`:9`) and wraps `TrackedLink`, so it cannot wrap a form submit and cannot express a control with no audience. **Its own test asserts "records a click, and which of the TWO audiences it belongs to"** | `src/components/analytics/TrackedCta.tsx:9`, `TrackedCta.test.tsx:109` |
| `captureClientEvent` calls `initPostHog` first and returns whether it captured, because a capture before init once destroyed a page's first event | `src/lib/analytics/capture.ts` |
| `posthog-js` is initialised with `capture_pageview: false` and **no performance or web-vitals capture at all** | `src/lib/posthog.ts:19` |
| **The ingestion probe already passes `refresh: "force_blocking"` on every HogQL request, under a comment recording that PostHog caches an answer against the query TEXT** (measured 3 September 2026: 52 requests over 182s all served one cached zero) | `src/lib/analytics/ingestion-probe.ts:91-101` and `:314-320` |
| `/how-it-works` is linked from exactly three places outside its own folder: `page.tsx:226`, `page.tsx:260`, and `src/app/sitemap.ts`. `primaryNavItems` offers only `/nurses` and `/blog`; the Footer links `/blog`, `/privacy`, `/terms`, `/attributions` | grep across `src` and `e2e` |
| `primaryNavItems` differs by role (a nurse does not get "Find a Nurse"), so the whole nav cluster is auth dependent, not just the CTA | `src/components/shared/nav-items.ts` |
| **The repo's own phone viewport is 390x844**, in `WIDTHS`, and `e2e/nurses-redesign.spec.ts:198` already has a `collectConsole` helper with an `IGNORED` noise list (vercel.live, Fast Refresh, dev-mode eval CSP) | `e2e/nurses-redesign.spec.ts:177-209` |
| Skills, measured over the 58 listed: only **3** tick all 17; the distribution runs 2 to 17 with a median of 10; `medication_management` 94.8%, `vital_signs` 91.4%, `cpr_first_aid` 82.8%, but `ventilator_care` 41.4%, `physical_therapy_support` 32.8%, `transportation` 32.8% | live query, committed with the roster snapshot |


## Six that are worth knowing before touching any of this

1. **The onward rate from the homepage is 3.2 percent.** Over 28 days, 1,374 sessions entered at `/`
   (excluding any session touching `/dashboard`, `/login` or `/admin`) and 44 of them viewed a second
   distinct path. A rate of 13 percent quoted anywhere is the figure across all entry paths and is a
   different question.
2. **There are no Featured nurses at all**, 0 of 58 listed and 0 of 76 visible and verified. So any
   copy naming Featured first is false on every real search today. Derive such a sentence from the
   results rather than asserting it, and it stays correct both now and the day the first $29
   subscription sells.
3. **The homepage document is already dynamic and stays dynamic.** `(public)/layout.tsx` renders
   `Header`, which awaits `getCurrentUser()`, which reads cookies, and `cacheComponents` is off, so a
   cookie read anywhere in the tree opts the whole route out of prerendering. There is no document
   cache on the homepage to preserve or defeat.
4. **`is_hidden` has no write path in application code**, and `review_count` and `avg_rating` are
   written by a database trigger (`recalculate_nurse_rating()`, `supabase/migrations/003_functions.sql`).
   Any cache over nurse data therefore cannot be invalidated from the app for those fields, which
   makes a TTL a product decision about staleness rather than a tuning knob.
5. **Nothing in CI builds the app.** `.github/workflows/ci.yml` runs the merged-tree proof, lint, the
   db-error ratchet, typecheck, the test suite, the vitest cache check and guard-mutation, and `.next/`
   is gitignored. Vercel builds separately. Production promotion IS gated (`promote.yml`, since #817),
   so a failing `next build` means no staged deployment to promote and every pull request preview
   failing too.
6. **The installed Next is 16.2.3 while `package.json` asks for `^16.3.4`**, so the tree does not
   satisfy its own range and everything here was measured against 16.2.3. A fresh `npm ci` installs
   something else.
