# Who the directory shows

Three different populations get called "the nurses" in conversation, and they
are different sizes. This is what each one means, where the rule lives, and how
to read the current numbers.

Every figure here was measured against production on 3 September 2026 and is
re-measurable from the admin dashboard, which shows all three counts.

## The three populations

| | What it means | Where the rule lives |
|---|---|---|
| **Visible** | Verified, not hidden, owner neither deleted nor suspended | `applyVisibleNurseFilter` |
| **Listed** | Visible, AND has a photo or a bio, AND has at least one care type | `applyListedNurseFilter` |
| **Searchable** | Listed, AND accepting new clients | `applyListedNurseFilter` plus `applyAvailabilityFilter` |

All three are in `src/lib/nurses/visibility.ts`, and the content rules they
apply are in `src/lib/nurses/listing.ts`. Nothing should re-state these
conditions inline: `visibility-callers.test.ts` lists every surface that reads
one of the filters and fails when a new one appears without being registered.

**Visible is not the same as listed, deliberately.** A family's saved nurses
and the nurses she has paid to reveal are read through the visible filter, so
a minimum-content rule there would delete something she already has. A nurse
who is not listed is still reachable by her own link.

## The gap, and the panel that reports it

On 3 September 2026 there were 100 visible nurses, 60 listed and 59 searchable,
so 40 verified nurses could not be found by any family. That number had been
measured once, by hand. The admin dashboard now carries a Directory coverage
panel showing all three counts, drawn through the filters above rather than
through a second set of conditions, so the panel and the directory cannot
disagree.

The panel also checks that listed plus not listed comes to visible. Those two
filters are exact complements, and nothing else compares them, so a change to
one that misses the other shows up there rather than quietly dropping nurses
out of both.

**A failed read is never shown as a zero.** The panel names the count it could
not read and says the numbers are unknown, because "the directory is empty" is
a confident claim and that is the one situation where nobody could tell it from
the truth.

## What a nurse who is not listed is told

- **In the product**: `NotListedNotice` sits on every step of the onboarding
  wizard and names what is missing, reading the same rule the directory
  filters on. It says nothing to a nurse who is not verified yet, because she
  is missing for a different reason.
- **By email**: the `not-listed-nudge` cron, daily at 14:50 UTC. It names what
  is actually missing for that nurse rather than assuming, sends once per
  nurse (an `email_log` row is claimed before the send and released if the
  send fails), and does not send at all unless `NOT_LISTED_NUDGE_SEND` is
  exactly `true`. Run it with the switch off to read `wouldSend`, which is the
  size of the send without making it.

## What verification requires

An admin cannot approve a nurse who has not finished onboarding. The floor is
`getOnboardingStatus`, the wizard's own definition of a finished profile, so
there is one definition rather than a second one beside it, and the refusal
names the step that is missing.

This matters because the badge is the promise to a family that somebody checked
her. Before that floor existed, 29 of the 32 verified HHAs held the badge with
no licence number on file, which is the one field onboarding requires of an HHA
and the one the check is supposed to rest on.

The 25 reachable nurses in that state were sent back on 3 September 2026 and
emailed to ask for the number. They are in the `rejected` state, whose dashboard
reads "Your verification needs a quick fix" and shows the reason.
`scripts/licence-number-backfill.ts` did it, is a dry run unless `CONFIRM=1`,
and `RESTORE=1 CONFIRM=1` puts them back. The undo is keyed on the exact reason
string, so it can never restore a nurse an admin rejected for a real reason.

When one of them fixes her profile, she returns to the review queue
automatically, from the edit form or from the wizard. Both write the same
shared rule (`resubmissionPatch`), because a nurse whose profile is unfinished
can only reach the wizard.
