import { describe, it, expect } from "vitest";
import {
  resolveAccountsTab,
  accountsQueryForTab,
} from "@/lib/admin/accounts-view";

describe("resolveAccountsTab", () => {
  it("passes through every known tab", () => {
    for (const tab of ["nurses", "families", "removed", "flagged"] as const) {
      expect(resolveAccountsTab(tab)).toBe(tab);
    }
  });

  it("defaults unknown or missing values to 'all'", () => {
    expect(resolveAccountsTab(undefined)).toBe("all");
    expect(resolveAccountsTab("")).toBe("all");
    expect(resolveAccountsTab("bogus")).toBe("all");
  });
});

describe("accountsQueryForTab", () => {
  it("lists soft-deleted accounts across all roles for the Removed tab", () => {
    expect(accountsQueryForTab("removed")).toEqual({ deleted: true });
  });

  it("scopes the role tabs to live accounts of that role", () => {
    expect(accountsQueryForTab("nurses")).toEqual({
      role: "nurse",
      deleted: false,
    });
    expect(accountsQueryForTab("families")).toEqual({
      role: "family",
      deleted: false,
    });
  });

  it("lists live accounts for the All tab", () => {
    expect(accountsQueryForTab("all")).toEqual({ deleted: false });
    expect(accountsQueryForTab("all").role).toBeUndefined();
  });
});
