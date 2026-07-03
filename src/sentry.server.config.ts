import * as Sentry from "@sentry/nextjs";

// 100% trace sampling in production would burn the Sentry quota and can
// end up dropping the error events that actually matter; sample fully in
// preview/dev where volume is low, 10% in production.
const tracesSampleRate = process.env.VERCEL_ENV === "production" ? 0.1 : 1.0;

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate,
});
