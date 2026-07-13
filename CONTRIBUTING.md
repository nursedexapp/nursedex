# Contributing

## Local checks

Run these before pushing. CI runs the same `lint`, `typecheck`, and `test`.

| Command             | What it does                                                | Expected time                                                                                                                                               |
| ------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck` | `next typegen` (regenerate route types) + `tsc --noEmit`    | ~3s warm; the first run after `npm install` or moving/adding routes can take a minute or two while Next warms up. Not a hang.                               |
| `npm run lint`      | ESLint over `src/`, cached in `node_modules/.cache/eslint/` | First run ~30-60s while ESLint loads the TypeScript preset; cached re-runs only re-check changed files. The initial wait is the parser booting, not a hang. |
| `npm run check`     | `typecheck` then `lint` in one shot                         | sum of the two                                                                                                                                              |
| `npm test`          | Vitest (`vitest run`)                                       | a few seconds                                                                                                                                               |

Notes:

- `typecheck` runs `next typegen` first so it validates generated route types too. This catches route/page type errors that otherwise only surface during `next build`, and avoids false errors from a stale `.next/types` after routes move.
- ESLint config lives in `eslint.config.mjs` (flat config, ESLint 9). There is no `.eslintrc`.
- If `typecheck` or `lint` seems stuck, give it the first-run budget above before assuming it hung.

## Deploying a migration

**Merging a PR does not deploy its migration.** The code ships to Vercel on merge; the database does not change until someone pushes it. Code that calls a function production does not have yet will fail for real users, so push the migration first, or immediately after.

```
npx supabase db push          # apply the migration to production
npx supabase migration list   # confirm local and remote agree
npm run smoke:prod            # confirm production still allows what the app needs
```

`npm run smoke:prod` reads production's own catalog and compares it against the grants the code actually needs (`scripts/prod-smoke.ts`). It is read-only: it selects from the system catalog and touches no application data.

Run it because CI cannot do this for you. CI builds a database from scratch out of the migrations; production is a database those migrations were applied to, one after another, over months. A migration can be correct on the first and still break a real user on the second:

- Migration 045 took away the grant `anon` needed on the waitlist, and signups broke.
- Migration 052 revoked `EXECUTE` from `authenticated` on every function, which also removed the explicit grants earlier migrations had written. Six user-facing functions became callable only by `service_role`, in production, for weeks. A family who clicked "Reveal contact info" spent one of their capped daily reveals and was shown an empty card, because the app could no longer read the contact back (#700).

Every one of those passed CI. The same check runs automatically on every merge to main and once a day (`.github/workflows/prod-smoke.yml`), so a forgotten push is caught, but it is faster to catch it yourself at the moment you push.
