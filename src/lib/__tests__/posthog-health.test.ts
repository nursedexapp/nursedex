import { describe, it, expect } from "vitest";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../../.env.local") });

describe("PostHog health check", () => {
  it("has valid PostHog credentials", () => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
    expect(key).toBeTruthy();
    expect(host).toBeTruthy();
    expect(host).toContain("posthog");
  });
});
