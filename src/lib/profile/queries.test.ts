// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// getNurseContactInfo is the SECURITY DEFINER gated path that returns nurse
// contact PII (email, phone) to the nurse, an admin, or a family with an active
// reveal. The gate lives in the get_nurse_contact RPC; this exercises the
// TypeScript wrapper: that a populated RPC row maps to the contact shape, and
// that a missing row or an RPC error fails closed to all nulls (#488).
const h = vi.hoisted(() => {
  const state = {
    data: null as Record<string, unknown> | null,
    error: null as unknown,
  };
  const calls = { rpc: [] as { fn: string; params: unknown }[] };
  const serverClient = {
    rpc: (fn: string, params: unknown) => {
      calls.rpc.push({ fn, params });
      if (fn === "get_nurse_contact") {
        return { maybeSingle: async () => ({ data: state.data, error: state.error }) };
      }
      throw new Error(`unexpected rpc ${fn}`);
    },
  };
  return { state, calls, serverClient };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => h.serverClient,
}));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: vi.fn(),
}));
vi.mock("./photos", () => ({ getSignedPhotoUrl: vi.fn() }));

import { getNurseContactInfo } from "./queries";

const NULLS = { email: null, phone: null, communication_preference: null };

beforeEach(() => {
  vi.clearAllMocks();
  h.state.data = null;
  h.state.error = null;
  h.calls.rpc = [];
});

describe("getNurseContactInfo", () => {
  it("maps a populated RPC row to the contact shape", async () => {
    h.state.data = {
      email: "nurse@example.com",
      phone: "555-0100",
      communication_preference: "email",
    };
    const contact = await getNurseContactInfo("nurse-1");
    expect(contact).toEqual({
      email: "nurse@example.com",
      phone: "555-0100",
      communication_preference: "email",
    });
  });

  it("calls the gated RPC with the nurse user id", async () => {
    h.state.data = { email: "a@b.com", phone: null, communication_preference: null };
    await getNurseContactInfo("nurse-42");
    expect(h.calls.rpc).toEqual([
      { fn: "get_nurse_contact", params: { p_nurse_user_id: "nurse-42" } },
    ]);
  });

  it("returns all nulls when the RPC yields no row (gate denied or no data)", async () => {
    h.state.data = null;
    const contact = await getNurseContactInfo("nurse-1");
    expect(contact).toEqual(NULLS);
  });

  it("fails closed to all nulls when the RPC errors", async () => {
    h.state.data = { email: "leak@example.com", phone: "555-9999", communication_preference: "phone" };
    h.state.error = { message: "permission denied" };
    const contact = await getNurseContactInfo("nurse-1");
    // Even with row data present, an error must not leak PII.
    expect(contact).toEqual(NULLS);
  });

  it("preserves individual null fields in a partial row", async () => {
    h.state.data = {
      email: "nurse@example.com",
      phone: null,
      communication_preference: null,
    };
    const contact = await getNurseContactInfo("nurse-1");
    expect(contact).toEqual({
      email: "nurse@example.com",
      phone: null,
      communication_preference: null,
    });
  });
});
