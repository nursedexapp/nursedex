import { describe, it, expect } from "vitest";
import * as Sentry from "@sentry/nextjs";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../../.env.local") });

describe("Sentry health check", () => {
  it("initializes with DSN", () => {
    const dsn = process.env.SENTRY_DSN;
    expect(dsn).toBeTruthy();

    Sentry.init({
      dsn,
      tracesSampleRate: 0,
    });

    const client = Sentry.getClient();
    expect(client).toBeTruthy();
    const dsn_parsed = client!.getDsn();
    expect(dsn_parsed).toBeTruthy();
    expect(dsn_parsed!.host).toContain("sentry.io");
  });
});
