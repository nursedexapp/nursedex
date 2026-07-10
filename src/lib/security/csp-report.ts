/**
 * Parse and filter Content-Security-Policy violation reports (#537).
 *
 * PR #536 added a real CSP scoped to exactly the origins the app loads. If a
 * future change adds a third-party script or frame and nobody updates the
 * allowlist in src/proxy.ts, the browser blocks it silently. This module backs
 * the /api/csp-report endpoint that surfaces those blocks.
 *
 * Browsers post violations in two shapes: the legacy report-uri body
 * (Content-Type application/csp-report, kebab-case keys under a "csp-report"
 * key) and the modern Reporting API (application/reports+json, an array of
 * reports with camelCase keys). normalizeCspReports flattens both.
 *
 * shouldReportViolation drops the noise that would otherwise bury real gaps:
 * browser extensions inject scripts and styles into every page and produce the
 * large majority of reports, and none of them are our allowlist problem.
 */

export interface CspViolation {
  violatedDirective: string;
  blockedUri: string;
  documentUri: string;
  sourceFile: string;
}

interface RawReport {
  violatedDirective?: unknown;
  blockedUri?: unknown;
  documentUri?: unknown;
  sourceFile?: unknown;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toViolation(raw: RawReport): CspViolation {
  return {
    violatedDirective: str(raw.violatedDirective),
    blockedUri: str(raw.blockedUri),
    documentUri: str(raw.documentUri),
    sourceFile: str(raw.sourceFile),
  };
}

/** Legacy `{ "csp-report": { "violated-directive": ... } }` (kebab keys). */
function fromLegacy(body: Record<string, unknown>): CspViolation | null {
  const r = body["csp-report"];
  if (!r || typeof r !== "object") return null;
  const o = r as Record<string, unknown>;
  return toViolation({
    violatedDirective: o["violated-directive"] ?? o["effective-directive"],
    blockedUri: o["blocked-uri"],
    documentUri: o["document-uri"],
    sourceFile: o["source-file"],
  });
}

/** Modern Reporting API entry `{ type: "csp-violation", body: {...} }`. */
function fromReportTo(entry: unknown): CspViolation | null {
  if (!entry || typeof entry !== "object") return null;
  const e = entry as { type?: unknown; body?: unknown };
  if (e.type !== "csp-violation" || !e.body || typeof e.body !== "object") {
    return null;
  }
  const b = e.body as Record<string, unknown>;
  return toViolation({
    violatedDirective: b.violatedDirective ?? b.effectiveDirective,
    blockedUri: b.blockedURL ?? b.blockedUri,
    documentUri: b.documentURL ?? b.documentUri,
    sourceFile: b.sourceFile,
  });
}

/**
 * Flatten either payload shape into a list of violations. Returns an empty
 * list (never throws) for anything unrecognized, so a malformed POST from a
 * confused client or a bot is a no-op rather than a 500.
 */
export function normalizeCspReports(body: unknown): CspViolation[] {
  if (Array.isArray(body)) {
    return body.map(fromReportTo).filter((v): v is CspViolation => v !== null);
  }
  if (body && typeof body === "object") {
    const legacy = fromLegacy(body as Record<string, unknown>);
    return legacy ? [legacy] : [];
  }
  return [];
}

// Schemes that only ever appear because a browser extension or the browser
// itself injected content. Never our allowlist gap.
const NOISE_SCHEMES = [
  "chrome-extension://",
  "moz-extension://",
  "safari-extension://",
  "safari-web-extension://",
  "webkit-masked-url://",
];

// blocked-uri values that carry no actionable origin.
const NOISE_URIS = new Set(["", "about", "about:blank", "null"]);

function isNoise(value: string): boolean {
  return NOISE_SCHEMES.some((scheme) => value.startsWith(scheme));
}

/**
 * Whether a violation is worth recording. Filters out extension-injected and
 * contentless reports, keeping real blocked origins and inline/eval blocks
 * (which signal an actual allowlist gap in our own pages).
 */
export function shouldReportViolation(v: CspViolation): boolean {
  if (NOISE_URIS.has(v.blockedUri)) return false;
  if (isNoise(v.blockedUri)) return false;
  if (isNoise(v.sourceFile)) return false;
  return true;
}

/** The origin of a blocked URI, or the raw value when it is not a URL. */
function blockedOrigin(blockedUri: string): string {
  try {
    return new URL(blockedUri).origin;
  } catch {
    return blockedUri; // "inline", "eval", "self", etc.
  }
}

/**
 * A stable grouping key so Sentry collapses many reports of the same gap into
 * one issue: the directive plus the blocked origin, not the full URL (which
 * carries cache-busting query strings and per-request paths).
 */
export function cspFingerprint(v: CspViolation): string[] {
  return ["csp", v.violatedDirective, blockedOrigin(v.blockedUri)];
}
