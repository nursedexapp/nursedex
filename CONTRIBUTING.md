# Contributing

## Local checks

Run these before pushing. CI runs the same `lint`, `typecheck`, and `test`.

| Command             | What it does                                                | Expected time                                                                                                                                               |
| ------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck` | `next typegen` (regenerate route types) + `tsc --noEmit`    | ~3s warm; the first run after `npm install` or moving/adding routes can take a minute or two while Next warms up. Not a hang.                               |
| `npm run lint`      | ESLint over `src/`, cached in `node_modules/.cache/eslint/` | First run ~30-60s while ESLint loads the TypeScript preset; cached re-runs only re-check changed files. The initial wait is the parser booting, not a hang. |
| `npm run check`     | `typecheck` then `lint` in one shot                         | sum of the two                                                                                                                                              |
| `npm test`          | Vitest (`vitest run`)                                       | a few seconds                                                                                                                                               |

| `npm run clean`     | Delete the disposable build caches (see below)               | a second or two                                                                                                                                                |

Notes:

- `typecheck` runs `next typegen` first so it validates generated route types too. This catches route/page type errors that otherwise only surface during `next build`, and avoids false errors from a stale `.next/types` after routes move.
- ESLint config lives in `eslint.config.mjs` (flat config, ESLint 9). There is no `.eslintrc`.
- If `typecheck` or `lint` seems stuck, give it the first-run budget above before assuming it hung.

## Clearing the build caches

`npm run clean` removes three caches:

| Path                          | What it holds                                    |
| ----------------------------- | ------------------------------------------------ |
| `.next`                       | the dev server's Turbopack cache and build output |
| `node_modules/.cache/eslint`  | ESLint's per-file cache                           |
| `.vitest-cache`               | vitest's slowest-first ordering store             |

All three are gitignored and rebuild themselves; the only cost is one slower
dev start and one slower lint. `npm run clean -- -n` says what it would remove
and removes nothing.

Run it when the working copy is unexpectedly large, or when a build behaves in
a way the source does not explain.

**Why this is a command and not a setting.** The dev server's Turbopack cache
grows and nothing prunes it. Measured on one machine: `.next/dev` was 2.4 GB on
2026-08-21 and 3.0 GB on 2026-09-03, against 4 MB of actual source.
`.next/dev/cache/turbopack` held 163 SST files, 93 of them written in July and
still present in September, so old entries are retained rather than compacted
or evicted.

This Next version has no knob for it. It exposes `turbopackFileSystemCacheForDev`
(a boolean, default `true`) and `turbopackMemoryLimit` (memory, not disk), and
nothing that caps the on-disk cache or prunes it by age. Switching the cache off
would pay for the disk with every cold start, which is the wrong trade, so the
remedy is a command people know about rather than a configuration change (#750).

## Which command runs which test

There are three vitest commands and they do not overlap. A test in the wrong
place runs nowhere, and running nowhere looks exactly like passing.

| Where the file lives                                   | What runs it          | Where that runs                               |
| ------------------------------------------------------ | --------------------- | --------------------------------------------- |
| `src/**`, `test/**`, `scripts/**`, `eslint-rules/**`   | `npm test`            | `ci.yml`, on every push                       |
| `src/lib/__tests__/**`, named in the `test:rls` script | `npm run test:rls`    | `e2e.yml`, against a throwaway local Supabase |
| `src/lib/__tests__/**`, live service diagnostics       | `npm run test:health` | nowhere, on purpose (they ping real services) |
| `e2e/**.spec.ts`                                       | `npm run test:e2e`    | `e2e.yml`                                     |

`vitest.config.ts` EXCLUDES `src/lib/__tests__`, so a guard written there is not
run by `npm test`. If it belongs in CI, add its path to the `test:rls` script.
`test/every-test-runs.test.ts` enforces this: every file in that directory must
either be named in `test:rls` or declared in its `LOCAL_ONLY` list with a
reason, and the list may not name a file that no longer exists.

The same trap exists in `e2e/`: a spec that calls `test.skip()` when its
environment is absent reports a pass. `data-api.spec.ts` does this deliberately
and is declared as an exception; the same guard fails any new spec that starts
doing it silently.

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
