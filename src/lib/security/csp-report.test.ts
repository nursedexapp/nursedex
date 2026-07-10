// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  normalizeCspReports,
  shouldReportViolation,
  cspFingerprint,
  type CspViolation,
} from "./csp-report";

// Legacy report-uri payload: Content-Type application/csp-report, kebab keys,
// wrapped in a "csp-report" object.
const legacyBody = {
  "csp-report": {
    "document-uri": "https://nursedex.com/nurses",
    "violated-directive": "script-src",
    "effective-directive": "script-src",
    "blocked-uri": "https://evil.example.com/tracker.js",
    "source-file": "https://nursedex.com/nurses",
  },
};

// Modern Reporting API payload: Content-Type application/reports+json, an array
// of reports, camelCase keys, blockedURL/documentURL.
const reportToBody = [
  {
    type: "csp-violation",
    url: "https://nursedex.com/nurses",
    body: {
      documentURL: "https://nursedex.com/nurses",
      violatedDirective: "script-src",
      effectiveDirective: "script-src",
      blockedURL: "https://evil.example.com/tracker.js",
      sourceFile: "https://nursedex.com/nurses",
    },
  },
];

function violation(overrides: Partial<CspViolation> = {}): CspViolation {
  return {
    violatedDirective: "script-src",
    blockedUri: "https://evil.example.com/tracker.js",
    documentUri: "https://nursedex.com/nurses",
    sourceFile: "https://nursedex.com/nurses",
    ...overrides,
  };
}

describe("normalizeCspReports", () => {
  it("reads the legacy application/csp-report shape", () => {
    expect(normalizeCspReports(legacyBody)).toEqual([
      {
        violatedDirective: "script-src",
        blockedUri: "https://evil.example.com/tracker.js",
        documentUri: "https://nursedex.com/nurses",
        sourceFile: "https://nursedex.com/nurses",
      },
    ]);
  });

  it("reads the modern report-to array shape", () => {
    expect(normalizeCspReports(reportToBody)).toEqual([
      {
        violatedDirective: "script-src",
        blockedUri: "https://evil.example.com/tracker.js",
        documentUri: "https://nursedex.com/nurses",
        sourceFile: "https://nursedex.com/nurses",
      },
    ]);
  });

  it("ignores non-csp reports in a report-to batch", () => {
    const mixed = [
      { type: "deprecation", url: "x", body: {} },
      ...reportToBody,
    ];
    expect(normalizeCspReports(mixed)).toHaveLength(1);
  });

  it("returns an empty list for an unrecognized body rather than throwing", () => {
    expect(normalizeCspReports(null)).toEqual([]);
    expect(normalizeCspReports({ nonsense: true })).toEqual([]);
    expect(normalizeCspReports("garbage")).toEqual([]);
  });
});

describe("shouldReportViolation", () => {
  it("reports a real third-party origin blocked by the policy", () => {
    expect(shouldReportViolation(violation())).toBe(true);
  });

  it("reports a blocked inline or eval violation", () => {
    expect(shouldReportViolation(violation({ blockedUri: "inline" }))).toBe(
      true,
    );
    expect(shouldReportViolation(violation({ blockedUri: "eval" }))).toBe(true);
  });

  // Browser extensions inject scripts and styles into every page and generate
  // the overwhelming majority of CSP noise. These are not our allowlist gaps.
  it.each([
    "chrome-extension://abc/inject.js",
    "moz-extension://abc/inject.js",
    "safari-extension://abc/inject.js",
    "safari-web-extension://abc/inject.js",
    "webkit-masked-url://hidden/",
  ])("drops the extension-origin report %s", (blockedUri) => {
    expect(shouldReportViolation(violation({ blockedUri }))).toBe(false);
  });

  it("drops a report whose source file is a browser extension", () => {
    expect(
      shouldReportViolation(
        violation({ sourceFile: "chrome-extension://abc/content.js" }),
      ),
    ).toBe(false);
  });

  it("drops empty, about, and null blocked URIs", () => {
    for (const blockedUri of ["", "about", "about:blank", "null"]) {
      expect(shouldReportViolation(violation({ blockedUri }))).toBe(false);
    }
  });
});

describe("cspFingerprint", () => {
  it("groups by directive and blocked origin, not full URL", () => {
    const a = cspFingerprint(
      violation({ blockedUri: "https://evil.example.com/a.js?v=1" }),
    );
    const b = cspFingerprint(
      violation({ blockedUri: "https://evil.example.com/b.js?v=2" }),
    );
    // Same directive + same host = one Sentry issue, not one per URL.
    expect(a).toEqual(b);
  });

  it("separates different directives", () => {
    const script = cspFingerprint(
      violation({ violatedDirective: "script-src" }),
    );
    const frame = cspFingerprint(violation({ violatedDirective: "frame-src" }));
    expect(script).not.toEqual(frame);
  });

  it("keeps a non-URL blocked-uri (inline) as its own group", () => {
    expect(cspFingerprint(violation({ blockedUri: "inline" }))).toContain(
      "inline",
    );
  });
});
