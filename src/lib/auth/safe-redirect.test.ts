import { describe, it, expect } from "vitest";
import { isSafeRedirectPath } from "@/lib/auth/safe-redirect";

/**
 * Regression guard for the open-redirect in /auth/callback (issue #392).
 * `${origin}${next}` treats a `next` that isn't a single-leading-slash
 * relative path as an off-site jump: `@evil.com` parses the origin as
 * userinfo, `//evil.com` / `https://evil.com` supply their own host.
 */
describe("isSafeRedirectPath", () => {
  it.each([
    "@evil.com",
    "//evil.com",
    "/\\evil.com",
    "https://evil.com",
    "http://evil.com",
    "",
  ])("rejects %s", (value) => {
    expect(isSafeRedirectPath(value)).toBe(false);
  });

  it.each([null, undefined])("rejects %s", (value) => {
    expect(isSafeRedirectPath(value)).toBe(false);
  });

  it.each(["/dashboard", "/reset-password", "/nurses/123?tab=reviews"])(
    "accepts same-origin relative path %s",
    (value) => {
      expect(isSafeRedirectPath(value)).toBe(true);
    },
  );
});
