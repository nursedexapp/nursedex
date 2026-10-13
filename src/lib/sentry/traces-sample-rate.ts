/**
 * How much of Sentry's performance tracing to keep, from the Vercel
 * environment. 100% in production would burn the Sentry quota and can end up
 * dropping the error events that actually matter, so a tenth there and all of
 * it in preview and development, where volume is low. The privacy policy says
 * a sample of page loads is traced, so the browser must get the production
 * rate too: it reads NEXT_PUBLIC_VERCEL_ENV, which next.config.ts sets from
 * VERCEL_ENV at build time, because Next never inlines a bare VERCEL_ENV into
 * the browser bundle.
 *
 * Relative imports only: next.config.ts does not apply the "@/" alias.
 */
export function tracesSampleRateFor(vercelEnv: string | undefined): number {
  return vercelEnv === "production" ? 0.1 : 1.0;
}
