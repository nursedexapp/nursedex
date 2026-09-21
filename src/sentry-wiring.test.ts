import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import path from "path";

const root = path.resolve(__dirname, "..");

function read(relativePath: string): string {
  return readFileSync(path.resolve(root, relativePath), "utf-8");
}

describe("Sentry wiring (#394, #395, #400)", () => {
  it("wraps next.config.ts with withSentryConfig", () => {
    const source = read("next.config.ts");
    expect(source).toMatch(/withSentryConfig/);
  });

  it("has an instrumentation.ts that registers the server and edge configs", () => {
    expect(existsSync(path.resolve(root, "src/instrumentation.ts"))).toBe(true);
    const source = read("src/instrumentation.ts");
    expect(source).toMatch(/sentry\.server\.config/);
    expect(source).toMatch(/sentry\.edge\.config/);
    expect(source).toMatch(/onRequestError/);
  });

  it("has an instrumentation-client.ts that reads a NEXT_PUBLIC Sentry DSN", () => {
    expect(
      existsSync(path.resolve(root, "src/instrumentation-client.ts")),
    ).toBe(true);
    const source = read("src/instrumentation-client.ts");
    expect(source).toMatch(/NEXT_PUBLIC_SENTRY_DSN/);
  });

  it("exports onRouterTransitionStart so navigations are instrumented", () => {
    const source = read("src/instrumentation-client.ts");
    expect(source).toMatch(/onRouterTransitionStart/);
  });

  it("no longer reads a bare (non-public) DSN on the client", () => {
    expect(existsSync(path.resolve(root, "sentry.client.config.ts"))).toBe(
      false,
    );
  });

  it("does not sample 100% of traces unconditionally in server/edge/client configs", () => {
    const configs = [
      "src/sentry.server.config.ts",
      "src/sentry.edge.config.ts",
      "src/instrumentation-client.ts",
    ];
    for (const file of configs) {
      const source = read(file);
      expect(source).not.toMatch(/tracesSampleRate:\s*1\.0,?\s*\n/);
    }
  });

  // Whether those errors are actually discarded is asserted against Sentry's
  // own filter in src/lib/sentry/ignored-browser-errors.test.ts. This only
  // checks the list reaches the SDK, which is all a source read can establish.
  it("hands the in-app browser ignore list to Sentry (NURSEDEX-SITE-5, NURSEDEX-SITE-Y)", () => {
    const source = read("src/instrumentation-client.ts");
    expect(source).toMatch(/ignoreErrors:\s*IGNORED_BROWSER_ERRORS/);
    expect(source).toMatch(
      /import\s*\{[^}]*\bIGNORED_BROWSER_ERRORS\b[^}]*\}\s*from\s*"@\/lib\/sentry\/ignored-browser-errors"/,
    );
  });

  // Same split as above: that the app:// frames are really discarded is
  // asserted against Sentry's own filter in ignored-browser-errors.test.ts.
  // A deny list that never reaches Sentry.init drops nothing (L3).
  it("hands the in-app browser frame deny list to Sentry (NURSEDEX-SITE-12)", () => {
    const source = read("src/instrumentation-client.ts");
    expect(source).toMatch(/denyUrls:\s*IGNORED_BROWSER_FRAME_URLS/);
  });
});
