// @vitest-environment node
import { describe, it, expect } from "vitest";
import { buildConfirmUrl } from "./route";

/**
 * Regression guard for issue #392: buildConfirmUrl forwards Supabase's
 * `redirect_to`'s inner `?next=` into /auth/callback's own `next` param, so
 * it needs the same same-origin-relative-path check as the callback route
 * itself, not just a "was it parseable" check.
 */

function payload(redirectTo: string) {
  return {
    user: { id: "u1", email: "a@example.com" },
    email_data: {
      token: "t",
      token_hash: "th",
      redirect_to: redirectTo,
      email_action_type: "recovery",
      site_url: "https://nursedex.com",
    },
  };
}

describe("buildConfirmUrl next-param validation", () => {
  it.each(["@evil.com", "//evil.com", "https://evil.com"])(
    "drops an unsafe inner next (%s)",
    (unsafeNext) => {
      const url = buildConfirmUrl(
        payload(`https://nursedex.com/auth/callback?next=${encodeURIComponent(unsafeNext)}`),
      );

      expect(new URL(url).searchParams.has("next")).toBe(false);
    },
  );

  it("passes through a safe inner next", () => {
    const url = buildConfirmUrl(
      payload("https://nursedex.com/auth/callback?next=%2Freset-password"),
    );

    expect(new URL(url).searchParams.get("next")).toBe("/reset-password");
  });

  it("omits next entirely when redirect_to has none", () => {
    const url = buildConfirmUrl(payload("https://nursedex.com/auth/callback"));

    expect(new URL(url).searchParams.has("next")).toBe(false);
  });
});
