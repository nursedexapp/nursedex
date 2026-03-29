import { describe, it, expect, beforeAll } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../../.env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

let supabase: SupabaseClient;

beforeAll(() => {
  expect(SUPABASE_URL).toBeTruthy();
  expect(SUPABASE_KEY).toBeTruthy();
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
});

describe("calculate_distance function", () => {
  it("returns 0 for identical points", async () => {
    const { data, error } = await supabase.rpc("calculate_distance", {
      lat1: 40.7128,
      lon1: -74.006,
      lat2: 40.7128,
      lon2: -74.006,
    });

    expect(error).toBeNull();
    expect(data).toBeCloseTo(0, 1);
  });

  it("calculates NYC to Ronkonkoma (~47 miles)", async () => {
    const { data, error } = await supabase.rpc("calculate_distance", {
      lat1: 40.7128,
      lon1: -74.006,
      lat2: 40.8112,
      lon2: -73.1151,
    });

    expect(error).toBeNull();
    expect(data).toBeGreaterThan(40);
    expect(data).toBeLessThan(55);
  });

  it("calculates short distance within Long Island (~5 miles)", async () => {
    // Babylon to Bay Shore
    const { data, error } = await supabase.rpc("calculate_distance", {
      lat1: 40.6954,
      lon1: -73.3257,
      lat2: 40.7251,
      lon2: -73.2454,
    });

    expect(error).toBeNull();
    expect(data).toBeGreaterThan(3);
    expect(data).toBeLessThan(8);
  });

  it("handles cross-country distance (~2,450 miles)", async () => {
    // NYC to LA
    const { data, error } = await supabase.rpc("calculate_distance", {
      lat1: 40.7128,
      lon1: -74.006,
      lat2: 34.0522,
      lon2: -118.2437,
    });

    expect(error).toBeNull();
    expect(data).toBeGreaterThan(2400);
    expect(data).toBeLessThan(2500);
  });

  it("is symmetric (A to B equals B to A)", async () => {
    const { data: d1 } = await supabase.rpc("calculate_distance", {
      lat1: 40.7128,
      lon1: -74.006,
      lat2: 40.8112,
      lon2: -73.1151,
    });

    const { data: d2 } = await supabase.rpc("calculate_distance", {
      lat1: 40.8112,
      lon1: -73.1151,
      lat2: 40.7128,
      lon2: -74.006,
    });

    expect(d1).toBeCloseTo(d2!, 5);
  });
});
