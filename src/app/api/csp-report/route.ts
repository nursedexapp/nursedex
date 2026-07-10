import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import {
  normalizeCspReports,
  shouldReportViolation,
  cspFingerprint,
} from "@/lib/security/csp-report";

export const runtime = "nodejs";
// The browser posts violation reports unprompted; nothing here is cached.
export const dynamic = "force-dynamic";

/**
 * Receives Content-Security-Policy violation reports (#537) from the report-uri
 * and report-to directives set in src/proxy.ts. A blocked resource means the
 * policy is missing an allowlist entry that a change forgot to add; without
 * this endpoint the block is silent until a user complains.
 *
 * Filtered violations go to Sentry at warning level (visible in the dashboard,
 * deliberately below the error threshold the Sentry-to-Slack cron relays, so a
 * benign report does not page anyone). The endpoint always answers 204 and
 * never throws: it is unauthenticated and hit by browsers and bots, so a 500
 * would read as an outage and could be provoked at will.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  for (const violation of normalizeCspReports(body)) {
    if (!shouldReportViolation(violation)) continue;

    Sentry.captureMessage(
      `CSP violation: ${violation.violatedDirective} blocked ${violation.blockedUri}`,
      {
        level: "warning",
        tags: { action: "csp", directive: violation.violatedDirective },
        fingerprint: cspFingerprint(violation),
        extra: {
          documentUri: violation.documentUri,
          sourceFile: violation.sourceFile,
        },
      },
    );
  }

  return new NextResponse(null, { status: 204 });
}
