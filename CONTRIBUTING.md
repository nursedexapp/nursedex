# Contributing

## Local checks

Run these before pushing. CI runs the same `lint`, `typecheck`, and `test`.

| Command | What it does | Expected time |
| --- | --- | --- |
| `npm run typecheck` | `next typegen` (regenerate route types) + `tsc --noEmit` | ~3s warm; the first run after `npm install` or moving/adding routes can take a minute or two while Next warms up. Not a hang. |
| `npm run lint` | ESLint over `src/`, cached in `node_modules/.cache/eslint/` | First run ~30-60s while ESLint loads the TypeScript preset; cached re-runs only re-check changed files. The initial wait is the parser booting, not a hang. |
| `npm run check` | `typecheck` then `lint` in one shot | sum of the two |
| `npm test` | Vitest (`vitest run`) | a few seconds |

Notes:

- `typecheck` runs `next typegen` first so it validates generated route types too. This catches route/page type errors that otherwise only surface during `next build`, and avoids false errors from a stale `.next/types` after routes move.
- ESLint config lives in `eslint.config.mjs` (flat config, ESLint 9). There is no `.eslintrc`.
- If `typecheck` or `lint` seems stuck, give it the first-run budget above before assuming it hung.
