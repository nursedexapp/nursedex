---
description: Complete a NurseDex consulting request: compute hours, gather merged PRs, summarize, and post the completion report to its Slack thread
---

<!--
  Source of truth for the /done Claude Code command.

  The live command lives in the user-global commands dir (~/.claude/commands/done.md),
  which is gitignored, so this committed copy is canonical. It drives the
  /api/slack/track endpoint and scripts/consulting/session-hours.mjs; keep the
  three in sync. To install or refresh the global command, mirror this file:
    cp scripts/consulting/done.command.md ~/.claude/commands/done.md
-->

Complete consulting request **#$ARGUMENTS** for the NurseDex consulting workflow. Work through these steps, pausing for the user's confirmation before posting.

This only applies in the NurseDex repo. If the cwd is not the NurseDex project, stop and say so.

## 1. Resolve the request
- The request id is `$ARGUMENTS` (a number like `14`). If it is empty, ask which request to complete.

## 2. Load the admin secret
- `vercel env pull /tmp/nd_done_env --environment production --yes` then read `ADMIN_SECRET` from it. Do not print the value. Delete `/tmp/nd_done_env` at the end.
- If on the wrong Vercel account, the pull will lack the var; tell the user to fix the account.

## 3. Fetch request context
- `curl -sS "https://nursedex.com/api/slack/track?request_id=<id>" -H "x-admin-secret: $SECRET"`
- Read `status`, `type`, `rate`, `approved_at`, `title`.
- If `status` is `rejected` or still `submitted`/`triaged` (i.e. not approved), warn the user: ad hoc work should be approved before it is billed. Ask whether to continue anyway.

## 4. Compute hours
- Active + wall clock: `node scripts/consulting/session-hours.mjs` → JSON `{ wall_clock_min, active_min }`. Bill on `active_min`.
- Commit span: `git log main..HEAD --format=%ct`. If there are commits, `commit_span_min = round((max - min) / 60)`; if none (e.g. already merged), omit it.

## 5. Gather merged PRs in the time window
- `gh pr list --state merged --json number,title,url,mergedAt --limit 30`
  - If it errors with "Could not resolve to a Repository", run `gh auth switch -u nursedexapp` first, then retry.
- Keep only PRs whose `mergedAt` is on or after the request's `approved_at` (the time window the user chose for PR linking).
- **Show the candidate PR list to the user and let them remove any that are unrelated.** Do not assume the window is clean.

## 6. Summarize the work
- Write a concise summary (3 to 6 bullet points) of what was done, based on the selected PRs' titles, bodies, and diffs. Plain, factual, no fluff.

## 7. Generate the changelog
- Invoke the `changelog-writer` skill (via the Skill tool) scoped to the selected PRs and their commit range (`main..HEAD` plus the merged PRs from step 5).
- Ask it for a short changelog grouped by impact type (Added, Fixed, Changed, etc.), formatted as Slack mrkdwn (use `*bold*` headers, `-` or `•` bullets), not full Keep a Changelog with version headers or compare links. This goes inside a Slack message, so keep it tight.
- Reference each entry's PR by number where it helps (`(#123)`).

## 8. Confirm before posting
Show the user:
- Billed hours (active), plus wall clock and commit span for transparency
- The final PR list
- The summary
- The changelog
- The computed cost = rate × active hours

Ask for explicit confirmation. Only proceed on yes.

## 9. Post
Send the summary and the changelog as separate fields. The endpoint renders the changelog as its own `*Changelog*` block in the completion post, between the summary and the PR list.
```
curl -sS -X POST https://nursedex.com/api/slack/track \
  -H "x-admin-secret: $SECRET" -H "content-type: application/json" \
  -d '{"request_id": <id>, "billed_min": <active_min>, "wall_clock_min": <wall>, "active_min": <active>, "commit_span_min": <commit or omit>, "summary": "<summary>", "changelog": "<changelog mrkdwn>", "prs": [{"url":"...","title":"..."}], "note": "<optional>"}'
```
`summary` is the concise summary and `changelog` is the Slack mrkdwn changelog from step 7 (omit `changelog` if there is nothing to list). The endpoint logs the time entry, marks the request done, and the bot posts the completion report (summary, changelog, PR links, hours, cost) into the request's Slack thread.

## 10. Wrap up
- Report the endpoint's response (billed hours and cost).
- Delete `/tmp/nd_done_env`.
