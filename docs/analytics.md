# NurseDex Analytics Guide

How to read NurseDex numbers without drawing the wrong conclusion. Written for anyone
looking at the data, not just developers.

Last updated: September 2, 2026

---

## The one rule that matters most

**Split acquisition numbers by `utm_source` before comparing anything month to month.**

NurseDex traffic is not one audience. It is at least two, and they behave nothing alike:

| Traffic | What it is | Roughly how it behaves |
|---|---|---|
| Untagged Facebook | Posts, shares and group activity with no tag on the link | About 25% to 44% look at a second page |
| Tagged `ig` and `fb` | The bio link and tagged posts | About 4% look at a second page |

Averaging them together produced a headline that read as a seventeen fold collapse in
people reaching the nurse directory between June and August 2026. Each population was
roughly steady. What changed was the mix: the good traffic dried up and the weak traffic
grew. Nothing about the product got worse.

The full working is in issue #872, and the unanswered question it left is issue #892.

---

## Which system is authoritative

Two systems count NurseDex activity, they disagree on purpose, and neither is wrong.

| Question | Source | Why |
|---|---|---|
| How many signups, subscribers, nurses, families | **The database** (`/admin/analytics`) | Real accounts. Excludes seeded demo nurses, hidden and removed accounts. |
| Revenue, MRR, active subscriptions | **The database**, ultimately Stripe | Money has one ledger. |
| How people arrived, what they clicked, where they dropped out | **PostHog** | Behaviour, not accounts. |
| Whether a funnel step is being reached at all | **PostHog** | Only PostHog records the steps. |

**They will not reconcile, and should not be forced to.** A seeded demo nurse is excluded
from the admin count but still fires events. A subscription recorded by the Stripe webhook
and one recorded by a browser event are the same subscription counted in two places. A
visitor who never signs up exists in PostHog and nowhere else.

So: **quote business numbers from the database and behaviour from PostHog, and say which
one a number came from whenever both could plausibly have produced it.** If the two ever
have to be shown side by side, label the source under each.

---

## PostHog visitor counts are not headcounts

**Never report a PostHog person count as a number of people.**

Almost all NurseDex traffic arrives through the Instagram and Facebook in app browsers.
Each of those opens links in its own browser with its own isolated storage, so one person
arriving twice, or arriving through both platforms, is recorded as separate anonymous
visitors. PostHog can only join them when someone logs in, and very few ever do.

The evidence: of 1,189 social visitors in the 30 days to 1 September 2026, exactly **one**
appeared with both an Instagram and a Facebook referrer. That is not credible about human
beings. It is an artifact.

What to do instead:

1. Say **visits** or **sessions**, never users or people.
2. Prefer session level queries (group by `properties.$session_id`). They are immune to
   this entirely, and they were what confirmed the #872 finding was real.
3. When a genuine headcount is needed, take it from the database, which has real accounts
   behind it.

Ratios and same platform comparisons over time are unaffected, because the same
fragmentation applies to both ends of the comparison. Only the absolute headcount is wrong,
and it is always wrong in the flattering direction.

---

## The link tagging convention

Every link posted anywhere carries UTM tags. PostHog captures all five parameters
automatically, so nothing needs building. This is a habit, not a feature, and it only works
if it is done every time.

### The values

| Parameter | Values | Meaning |
|---|---|---|
| `utm_source` | `ig`, `fb`, `nextdoor`, `email` | The platform. Short and stable. |
| `utm_medium` | `bio`, `post`, `story`, `paid`, `group` | Where the link sat. `paid` is the one that answers whether traffic was bought. |
| `utm_campaign` | A short slug, for example `nurse-recruiting-sep` | The thing being promoted. Reuse it across a run of posts. |

### The two rules

1. **Keep the values short and stable.** A convention that drifts is worse than none,
   because the data looks segmented while quietly mixing categories. `fb` and `facebook`
   as two sources is exactly the failure this is meant to prevent.
2. **Absent is not a category.** Tagged and untagged links will coexist for a long time, so
   anything reading these has to treat a missing `utm_source` as **untagged**, and say so
   on the surface. Never let it fall into a bucket named after a platform.

### Example

```
https://nursedex.com/nurses?utm_source=ig&utm_medium=bio&utm_campaign=nurse-recruiting-sep
```

### Why it matters right now

Two changes are due at roughly the same time: repointing the Instagram bio link, and adding
calls to action to posts. Without tags, if the numbers move, nothing says which change
caused it, and the wrong one gets the credit and gets repeated.

---

## What the funnel records

As of September 2026 every named event fires, and a test refuses any event name that has no
call site, so this list cannot quietly go stale.

The acquisition and activation path: `signup_started`, `signup_completed`, `login`,
`role_selected`, `onboarding_started`, `onboarding_step_completed`, `onboarding_completed`.

`role_selected` carries the role, which is the only place the product records whether
someone joined as a nurse or as a family. That single property answers a question the
business could not previously answer at all.

The homepage: `homepage_cta_seen` and `homepage_cta_clicked`, both carrying which audience
the button speaks to. Seen matters as much as clicked, because a visitor who never scrolled
to the button and one who saw it and ignored it are otherwise identical in the data, and
they point at completely different fixes.

Two things are deliberately NOT recorded, because PostHog already records them and a second
measurement would be a rival number for the same fact: **page views** (PostHog's own
`$pageview` fires on every route change) and **scroll depth**
(`$prev_pageview_max_scroll_percentage` is on every page leave).
