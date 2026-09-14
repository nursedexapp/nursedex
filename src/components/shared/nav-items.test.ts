import { describe, it, expect } from "vitest";
import { primaryNavItems } from "./nav-items";
import { UserRole } from "@/types/enums";

const EVERY_VIEWER = [
  null,
  UserRole.FAMILY,
  UserRole.NURSE,
  UserRole.ADMIN,
  UserRole.SUPER_ADMIN,
] as const;

describe("primaryNavItems", () => {
  it("offers Find a Nurse to a signed out visitor", () => {
    expect(primaryNavItems(null).map((i) => i.href)).toContain("/nurses");
  });

  it("offers Find a Nurse to a family", () => {
    expect(primaryNavItems(UserRole.FAMILY).map((i) => i.href)).toContain(
      "/nurses",
    );
  });

  it.each([UserRole.ADMIN, UserRole.SUPER_ADMIN])(
    "offers Find a Nurse to an %s, who has a reason to browse the directory",
    (role) => {
      expect(primaryNavItems(role).map((i) => i.href)).toContain("/nurses");
    },
  );

  it("does not offer Find a Nurse to a signed in nurse", () => {
    expect(primaryNavItems(UserRole.NURSE).map((i) => i.href)).not.toContain(
      "/nurses",
    );
  });

  it("keeps Blog for every viewer, so a nurse is not left with an empty nav", () => {
    for (const role of EVERY_VIEWER) {
      expect(primaryNavItems(role).map((i) => i.href)).toContain("/blog");
    }
  });

  it("offers Pricing to every viewer, so the page that sells Featured can be found without signing in (#1042)", () => {
    for (const role of EVERY_VIEWER) {
      expect(primaryNavItems(role).map((i) => i.href)).toContain("/pricing");
    }
  });

  it("labels every item, so no link renders empty", () => {
    for (const role of EVERY_VIEWER) {
      for (const item of primaryNavItems(role)) {
        expect(item.label.trim()).not.toBe("");
      }
    }
  });
});
