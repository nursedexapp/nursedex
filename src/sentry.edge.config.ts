import * as Sentry from "@sentry/nextjs";

// See src/sentry.server.config.ts for why this isn't a flat 1.0.
const tracesSampleRate = process.env.VERCEL_ENV === "production" ? 0.1 : 1.0;

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate,
});
