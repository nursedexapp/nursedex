#!/usr/bin/env bash
# Runs the live-Supabase RLS/Data API grants tests against the local
# instance, without ever letting them see the production credentials in
# .env.local. .env.local is temporarily moved aside and always restored
# (even on failure or Ctrl-C) via the trap below.
#
# Usage: scripts/test-rls-local.sh [extra vitest args]
#   scripts/test-rls-local.sh
#   scripts/test-rls-local.sh src/lib/__tests__/data-api-grants.test.ts

set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=".env.local"
ENV_BACKUP=".env.local.bak.$$"

restore_env() {
  if [ -f "$ENV_BACKUP" ]; then
    mv "$ENV_BACKUP" "$ENV_FILE"
  fi
}
trap restore_env EXIT INT TERM

if [ -f "$ENV_FILE" ]; then
  mv "$ENV_FILE" "$ENV_BACKUP"
fi

npx supabase start >/dev/null

# `supabase status -o env` prints KEY="value" lines with no `export`
# keyword, so a plain `eval "$(...)"` only sets shell-local variables that a
# child process (npm/vitest) never inherits. `set -a` makes every variable
# assigned while it's on get exported automatically.
set -a
eval "$(npx supabase status -o env \
  --override-name api.url=NEXT_PUBLIC_SUPABASE_URL \
  --override-name auth.anon_key=NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
  --override-name auth.service_role_key=SUPABASE_SECRET_KEY 2>/dev/null)"
NEXT_PUBLIC_SITE_URL="http://localhost:3000"
set +a

if [ "$#" -gt 0 ]; then
  npx vitest run --config vitest.health.config.ts "$@"
else
  npm run test:rls
fi
