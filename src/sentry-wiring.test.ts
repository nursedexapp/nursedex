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
    expect(existsSync(path.resolve(root, "src/instrumentation-client.ts"))).toBe(
      true,
    );
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

  it("ignores the Android in-app-browser bridge teardown error (NURSEDEX-SITE-5)", () => {
    const source = read("src/instrumentation-client.ts");
    expect(source).toMatch(/ignoreErrors/);
    expect(source).toMatch(/Java object is gone/);
  });
});
