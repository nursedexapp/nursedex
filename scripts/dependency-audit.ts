/**
 * Parse `npm audit --json` into a readable advisory report (#405).
 *
 * The repo had no npm audit step and no Dependabot config, so a known-
 * vulnerable package could sit in the tree unnoticed in a live payments app.
 * The scheduled workflow (dependency-audit.yml) pipes `npm audit --json` into
 * scripts/check-dependency-audit.ts, which uses this module to produce the
 * summary. It is non-blocking by design (see the runner): the tree already
 * carries transitive advisories, and failing CI on every one would train
 * everyone to ignore it. hasAtOrAbove is provided so a severity gate can be
 * switched on later without reworking the parser.
 *
 * Shape of the payload (auditReportVersion 2): a severity histogram at
 * metadata.vulnerabilities, and a per-package map at vulnerabilities where each
 * `via` entry is either an advisory object or a bare package-name string (a
 * transitive link to another vulnerable package).
 */

export type Severity = "info" | "low" | "moderate" | "high" | "critical";

const SEVERITY_ORDER: Severity[] = [
  "info",
  "low",
  "moderate",
  "high",
  "critical",
];

export interface SeverityCounts {
  info: number;
  low: number;
  moderate: number;
  high: number;
  critical: number;
  total: number;
}

export interface Advisory {
  name: string;
  severity: string;
  direct: boolean;
  fixAvailable: boolean;
  /** Advisory title, or null when `via` held only transitive links. */
  title: string | null;
}

export interface AuditReport {
  counts: SeverityCounts;
  advisories: Advisory[];
}

function firstAdvisoryTitle(via: unknown): string | null {
  if (!Array.isArray(via)) return null;
  for (const entry of via) {
    if (entry && typeof entry === "object" && "title" in entry) {
      const title = (entry as { title?: unknown }).title;
      if (typeof title === "string") return title;
    }
  }
  return null;
}

export function parseAudit(raw: string): AuditReport {
  const parsed: unknown = JSON.parse(raw);
  const counts = (parsed as { metadata?: { vulnerabilities?: unknown } })
    ?.metadata?.vulnerabilities;

  if (!counts || typeof counts !== "object" || !("total" in counts)) {
    throw new Error(
      "not an npm audit payload: metadata.vulnerabilities is missing",
    );
  }

  const vulnerabilities =
    (parsed as { vulnerabilities?: Record<string, unknown> }).vulnerabilities ??
    {};

  const advisories: Advisory[] = Object.values(vulnerabilities).map((v) => {
    const pkg = v as {
      name?: string;
      severity?: string;
      isDirect?: boolean;
      fixAvailable?: unknown;
      via?: unknown;
    };
    return {
      name: pkg.name ?? "unknown",
      severity: pkg.severity ?? "unknown",
      direct: pkg.isDirect === true,
      // npm reports fixAvailable as a boolean or an object describing the fix.
      fixAvailable: pkg.fixAvailable !== false && pkg.fixAvailable != null,
      title: firstAdvisoryTitle(pkg.via),
    };
  });

  return { counts: counts as SeverityCounts, advisories };
}

/** Whether any vulnerability is at or above the given severity. */
export function hasAtOrAbove(
  report: AuditReport,
  threshold: Severity,
): boolean {
  const min = SEVERITY_ORDER.indexOf(threshold);
  return SEVERITY_ORDER.slice(min).some(
    (sev) => (report.counts[sev as keyof SeverityCounts] ?? 0) > 0,
  );
}

export function formatAuditReport(report: AuditReport): string {
  const { counts } = report;
  if (counts.total === 0) {
    return "npm audit: no known vulnerabilities in the dependency tree.";
  }

  const lines = [
    `npm audit: ${counts.total} known ${counts.total === 1 ? "vulnerability" : "vulnerabilities"}.`,
    "",
    `Severity: critical: ${counts.critical}, high: ${counts.high}, moderate: ${counts.moderate}, low: ${counts.low}, info: ${counts.info}`,
  ];

  const notable = report.advisories
    .filter((a) => a.severity === "critical" || a.severity === "high")
    .sort((a, b) =>
      a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1,
    );

  if (notable.length > 0) {
    lines.push("", "High and critical:");
    for (const a of notable) {
      const fix = a.fixAvailable ? "fix available" : "no fix yet";
      const scope = a.direct ? "direct" : "transitive";
      lines.push(
        `  ${a.name} (${a.severity}, ${scope}, ${fix})${a.title ? `: ${a.title}` : ""}`,
      );
    }
  }

  lines.push(
    "",
    "Review with: npm audit. Apply safe fixes with: npm audit fix.",
  );

  return lines.join("\n");
}
