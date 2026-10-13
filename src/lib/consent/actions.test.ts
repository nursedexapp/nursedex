import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ rpc: vi.fn(), ua: "Mozilla/5.0 (Macintosh)" }));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({ rpc: h.rpc }),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "user-agent": h.ua }),
}));

import { recordConsentEvent } from "./actions";

beforeEach(() => {
  h.rpc.mockReset();
  h.ua = "Mozilla/5.0 (Macintosh)";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("recordConsentEvent", () => {
  it("increments the tally for a known kind", async () => {
    h.rpc.mockResolvedValue({ error: null });
    await expect(recordConsentEvent("accepted")).resolves.toEqual({ ok: true });
    expect(h.rpc).toHaveBeenCalledWith("increment_consent_tally", { p_kind: "accepted" });
  });

  it("refuses an unknown kind without touching the database", async () => {
    await expect(recordConsentEvent("bogus" as unknown as "shown")).resolves.toEqual({ ok: false });
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("does not count a self declared crawler", async () => {
    h.ua = "Mozilla/5.0 (compatible; Googlebot/2.1)";
    await expect(recordConsentEvent("shown")).resolves.toEqual({ ok: false });
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("reports a database error as a failure and logs it", async () => {
    h.rpc.mockResolvedValue({ error: { message: "permission denied" } });
    await expect(recordConsentEvent("shown")).resolves.toEqual({ ok: false });
    expect(console.error).toHaveBeenCalled();
  });

  it("reports a thrown client as a failure rather than throwing", async () => {
    h.rpc.mockRejectedValue(new Error("network"));
    await expect(recordConsentEvent("declined")).resolves.toEqual({ ok: false });
  });
});
