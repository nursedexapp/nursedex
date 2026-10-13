import * as Sentry from "@sentry/nextjs";
import { tracesSampleRateFor } from "@/lib/sentry/traces-sample-rate";

// See src/lib/sentry/traces-sample-rate.ts for why this isn't a flat 1.0.
const tracesSampleRate = tracesSampleRateFor(process.env.VERCEL_ENV);

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate,
});
