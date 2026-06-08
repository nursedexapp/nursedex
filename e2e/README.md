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
