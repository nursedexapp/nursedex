// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  parseAudit,
  formatAuditReport,
  hasAtOrAbove,
  type AuditReport,
} from "./dependency-audit";

// Shape of `npm audit --json` (auditReportVersion 2): a severity histogram in
// metadata.vulnerabilities, and a per-package map in vulnerabilities. `via` is
// either an advisory object or a bare package-name string (a transitive link).
function auditJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    auditReportVersion: 2,
    vulnerabilities: {
      "@babel/core": {
        name: "@babel/core",
        severity: "low",
        isDirect: false,
        via: [
          {
            title: "Arbitrary File Read via sourceMappingURL",
            url: "https://github.com/advisories/GHSA-4x5r-pxfx-6jf8",
            severity: "low",
          },
        ],
        fixAvailable: true,
      },
      "left-pad": {
        name: "left-pad",
        severity: "critical",
        isDirect: true,
        via: [
          {
            title: "Prototype Pollution in left-pad",
            url: "https://github.com/advisories/GHSA-xxxx",
            severity: "critical",
          },
        ],
        fixAvailable: false,
      },
      transitive: {
        name: "transitive",
        severity: "high",
        isDirect: false,
        via: ["left-pad"],
        fixAvailable: true,
      },
    },
    metadata: {
      vulnerabilities: {
        info: 0,
        low: 1,
        moderate: 0,
        high: 1,
        critical: 1,
        total: 3,
      },
    },
    ...overrides,
  });
}

describe("parseAudit", () => {
  it("reads the severity counts from metadata", () => {
    const report = parseAudit(auditJson());
    expect(report.counts).toEqual({
      info: 0,
      low: 1,
      moderate: 0,
      high: 1,
      critical: 1,
      total: 3,
    });
  });

  it("lists each vulnerable package with its severity and whether a fix exists", () => {
    const report = parseAudit(auditJson());
    const critical = report.advisories.find((a) => a.name === "left-pad");
    expect(critical).toMatchObject({
      name: "left-pad",
      severity: "critical",
      direct: true,
      fixAvailable: false,
      title: "Prototype Pollution in left-pad",
    });
  });

  it("handles a via entry that is a bare package-name string", () => {
    const report = parseAudit(auditJson());
    const t = report.advisories.find((a) => a.name === "transitive");
    // No advisory object to read a title from; must not crash.
    expect(t?.severity).toBe("high");
    expect(t?.title).toBeNull();
  });

  it("reports a clean tree when there are no vulnerabilities", () => {
    const clean = JSON.stringify({
      auditReportVersion: 2,
      vulnerabilities: {},
      metadata: {
        vulnerabilities: {
          info: 0,
          low: 0,
          moderate: 0,
          high: 0,
          critical: 0,
          total: 0,
        },
      },
    });
    const report = parseAudit(clean);
    expect(report.counts.total).toBe(0);
    expect(report.advisories).toEqual([]);
  });

  // Fail loud, not silent: a malformed payload means the audit never ran. A
  // report of "0 vulnerabilities" there would be a false all-clear.
  it("throws on JSON that is not an audit payload", () => {
    expect(() => parseAudit("{}")).toThrow(/audit/i);
    expect(() => parseAudit("not json")).toThrow();
  });
});

describe("hasAtOrAbove", () => {
  it("is true when a vulnerability meets the threshold", () => {
    const report = parseAudit(auditJson());
    expect(hasAtOrAbove(report, "high")).toBe(true);
    expect(hasAtOrAbove(report, "critical")).toBe(true);
  });

  it("is false when nothing reaches the threshold", () => {
    const report: AuditReport = {
      counts: { info: 0, low: 4, moderate: 0, high: 0, critical: 0, total: 4 },
      advisories: [],
    };
    expect(hasAtOrAbove(report, "high")).toBe(false);
    expect(hasAtOrAbove(report, "moderate")).toBe(false);
  });
});

describe("formatAuditReport", () => {
  it("summarizes the counts and names high and critical packages", () => {
    const out = formatAuditReport(parseAudit(auditJson()));
    expect(out).toMatch(/critical: 1/);
    expect(out).toMatch(/high: 1/);
    expect(out).toMatch(/left-pad/);
  });

  it("states the tree is clean when there are no advisories", () => {
    const clean = parseAudit(
      JSON.stringify({
        auditReportVersion: 2,
        vulnerabilities: {},
        metadata: {
          vulnerabilities: {
            info: 0,
            low: 0,
            moderate: 0,
            high: 0,
            critical: 0,
            total: 0,
          },
        },
      }),
    );
    expect(formatAuditReport(clean)).toMatch(/no known vulnerabilities/i);
  });
});
