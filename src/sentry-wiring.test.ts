import { describe, it, expect, vi, afterEach } from "vitest";
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

  // VERCEL_ENV is not NEXT_PUBLIC_, so Next never inlines it into the browser
  // bundle: there it read undefined and every page load was traced, while the
  // privacy policy says a sample is. The live bundle carried
  // `"production"===V.default.env.VERCEL_ENV?.1:1` with V the process polyfill.
  it("reads the browser's trace rate from a value Next inlines into the bundle", () => {
    const source = read("src/instrumentation-client.ts");
    expect(source).not.toMatch(/process\.env\.VERCEL_ENV\b/);
    expect(source).toMatch(
      /tracesSampleRateFor\(\s*process\.env\.NEXT_PUBLIC_VERCEL_ENV,?\s*\)/,
    );
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

  // Whether a Deno stack is really dropped is asserted in
  // ignored-browser-errors.test.ts; this checks the SDK is handed the check.
  it("drops events from a page run inside Deno or a host app's injected script (NURSEDEX-SITE-18, NURSEDEX-SITE-1B)", () => {
    const source = read("src/instrumentation-client.ts");
    expect(source).toMatch(/beforeSend:\s*dropEventsNotFromOurCode/);
  });

  // That the guard keeps a translated page alive is proved in the browser by
  // e2e/translated-page.spec.ts; this checks it is installed, and reported.
  it("installs the translation guard with its Sentry reporter (#1240)", () => {
    const source = read("src/instrumentation-client.ts");
    expect(source).toMatch(
      /installTranslationGuard\(\s*createTranslationGuardReporter\(\)\s*\)/,
    );
  });

  it("does not record replays before consent: replay is not in Sentry.init", () => {
    const source = read("src/instrumentation-client.ts");
    const start = source.indexOf("Sentry.init(");
    const init = source.slice(start, source.indexOf("});", start) + 3);
    expect(init).not.toMatch(/replayIntegration/);
    expect(init).toMatch(/replaysOnErrorSampleRate/);
  });

  it("starts replay only behind the consent check", () => {
    expect(read("src/instrumentation-client.ts")).toMatch(
      /if \(analyticsAllowed\(\)\) startSentryReplay\(\);/,
    );
  });
});

describe("next.config hands the build's Vercel environment to the browser", () => {
  const original = process.env.VERCEL_ENV;
  afterEach(() => {
    if (original === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = original;
  });

  async function publicVercelEnvFor(value: string | undefined) {
    vi.resetModules();
    if (value === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = value;
    // The named export, not the wrapped default: withSentryConfig does
    // build-time work that has no place in a unit test.
    const { nextConfig } = await import("../next.config");
    return nextConfig.env?.NEXT_PUBLIC_VERCEL_ENV;
  }

  it("as NEXT_PUBLIC_VERCEL_ENV, set from VERCEL_ENV at build time", async () => {
    expect(await publicVercelEnvFor("production")).toBe("production");
    expect(await publicVercelEnvFor("preview")).toBe("preview");
  });

  it("as an empty string outside Vercel, which samples fully", async () => {
    expect(await publicVercelEnvFor(undefined)).toBe("");
  });
});
