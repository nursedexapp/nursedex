# End to end tests

Run the default suite (unauthenticated UI flows, safe against any environment):

```bash
npm run test:e2e
```

## Authenticated blog author tests

`blog.author.auth.spec.ts` drives the real admin CMS (create, publish, draft)
and asserts the public result. Because it writes real rows, it runs only when
`E2E_AUTH=1` and must point at a local or dedicated test Supabase, never
production.

`auth.setup.ts` provisions a confirmed admin in the configured Supabase, signs
it in through the login UI, and saves the session to `e2e/.auth/admin.json`
(gitignored). The authenticated project reuses that session.

### Run locally against local Supabase

Requires Docker (for `supabase start`).

```bash
# 1. Start local Supabase and apply migrations + seed
supabase start
supabase db reset

# 2. Point the app at local Supabase (use the keys from `supabase status`)
#    in .env.local, or export them for the run:
export NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321"
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="<anon key from supabase status>"
export SUPABASE_SECRET_KEY="<service_role key from supabase status>"

# 3. Optional: override the seeded admin credentials
export TEST_ADMIN_EMAIL="e2e-admin@nursedex.test"
export TEST_ADMIN_PASSWORD="e2e-admin-password-1234"

# 4. Run the authenticated suite
npm run test:e2e:auth
```

`test:e2e:auth` sets `E2E_AUTH=1`, which adds the `setup` and `authenticated`
Playwright projects. Without it, those projects are excluded and only the
unauthenticated specs run.

## Route smoke tests

`smoke.auth.spec.ts` signs in as admin and loads every key admin route and the
main public routes, asserting each returns a non-error status and does not fall
into an error boundary. This catches render-time crashes (a server/client
boundary mistake, a bad query) that typecheck and the build miss and that
otherwise only surface in production. It is read-only, but loads admin routes,
so it runs under the same `E2E_AUTH=1` authenticated project as the blog specs.

These run in CI. `.github/workflows/e2e.yml` runs the authenticated Playwright
suite on every pull request and on every push to main, under the job name
`authenticated e2e`, which the `Protect main` ruleset requires before a merge.

It needs no secrets and touches no real database: the job starts a throwaway
local Supabase in Docker, which applies the migrations and the seed, and points
the app at that. The dedicated test Supabase this section used to say was needed
was never necessary.

The job name is load bearing. The ruleset requires it by name, and
`scripts/check-merged-tree-proof.ts` asks about that same name when deciding
whether a merged tree has already been tested, so renaming the job silently
stops it gating merges.
