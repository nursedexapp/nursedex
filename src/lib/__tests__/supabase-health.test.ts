import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../../.env.local") });

describe("Supabase health check", () => {
  it("connects to Supabase and gets a response", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    expect(url).toBeTruthy();
    expect(key).toBeTruthy();

    const supabase = createClient(url!, key!);
    const { error } = await supabase.from("_non_existent_table").select("*").limit(1);
    // We expect a "relation does not exist" error, NOT a connection error.
    // That proves the client connected successfully to Supabase.
    expect(error).toBeTruthy();
    expect(error!.code).not.toBe("PGRST301"); // auth error
    expect(error!.message).not.toContain("fetch");
  });
});
