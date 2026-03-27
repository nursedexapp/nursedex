import { describe, it, expect } from "vitest";
import { Resend } from "resend";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../../.env.local") });

describe("Resend health check", () => {
  it("connects to Resend API", async () => {
    const key = process.env.RESEND_API_KEY;
    expect(key).toBeTruthy();

    const resend = new Resend(key);
    // List domains to verify the API key works
    const { data, error } = await resend.domains.list();
    expect(error).toBeNull();
    expect(data).toBeTruthy();
  });
});
