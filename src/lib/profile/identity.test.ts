import { describe, it, expect } from "vitest";
import {
  canSeeNurseIdentity,
  redactNurseIdentity,
  publicNurseMetaTitle,
  publicNurseMetaDescription,
} from "./identity";

const NURSE_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";

describe("canSeeNurseIdentity", () => {
  it("hides identity from anonymous viewers", () => {
    expect(canSeeNurseIdentity(NURSE_ID, {})).toBe(false);
  });

  it("hides identity from a family without a subscription or reveal", () => {
    expect(
      canSeeNurseIdentity(NURSE_ID, {
        role: "family",
        viewerId: OTHER_ID,
        hasSubscription: false,
        hasReveal: false,
      }),
    ).toBe(false);
  });

  it("shows identity to a subscribed family", () => {
    expect(
      canSeeNurseIdentity(NURSE_ID, {
        role: "family",
        viewerId: OTHER_ID,
        hasSubscription: true,
      }),
    ).toBe(true);
  });

  it("shows identity to a family that already revealed this nurse (grace window)", () => {
    expect(
      canSeeNurseIdentity(NURSE_ID, {
        role: "family",
        viewerId: OTHER_ID,
        hasSubscription: false,
        hasReveal: true,
      }),
    ).toBe(true);
  });

  it("shows identity to admins and super admins", () => {
    expect(canSeeNurseIdentity(NURSE_ID, { role: "admin" })).toBe(true);
    expect(canSeeNurseIdentity(NURSE_ID, { role: "super_admin" })).toBe(true);
  });

  it("shows identity to the nurse viewing their own profile", () => {
    expect(
      canSeeNurseIdentity(NURSE_ID, { role: "nurse", viewerId: NURSE_ID }),
    ).toBe(true);
  });

  it("hides identity from a different nurse", () => {
    expect(
      canSeeNurseIdentity(NURSE_ID, { role: "nurse", viewerId: OTHER_ID }),
    ).toBe(false);
  });
});

describe("redactNurseIdentity", () => {
  it("blanks the last name and nulls the license number when not entitled", () => {
    const nurse = { last_name: "Doe", license_number: "RN123456" };
    const { hasLicenseNumber } = redactNurseIdentity(nurse, false);
    expect(hasLicenseNumber).toBe(true);
    expect(nurse.last_name).toBe("");
    expect(nurse.license_number).toBeNull();
  });

  it("leaves identity intact when entitled", () => {
    const nurse = { last_name: "Doe", license_number: "RN123456" };
    const { hasLicenseNumber } = redactNurseIdentity(nurse, true);
    expect(hasLicenseNumber).toBe(true);
    expect(nurse.last_name).toBe("Doe");
    expect(nurse.license_number).toBe("RN123456");
  });

  it("reports no license number when one isn't on file", () => {
    const nurse = { last_name: "Doe", license_number: null };
    const { hasLicenseNumber } = redactNurseIdentity(nurse, false);
    expect(hasLicenseNumber).toBe(false);
    expect(nurse.last_name).toBe("");
  });
});

describe("public metadata helpers", () => {
  it("builds a title from the first name and credential, never the last name", () => {
    const title = publicNurseMetaTitle("Jane", "Registered Nurse (RN)");
    expect(title).toBe("Jane, Registered Nurse (RN) | NurseDex");
    expect(title).not.toContain("Doe");
  });

  it("uses the bio for the description when present", () => {
    expect(publicNurseMetaDescription("Jane", "RN", "Caring and reliable.")).toBe(
      "Caring and reliable.",
    );
  });

  it("falls back to a generated first-name-only description without a bio", () => {
    const desc = publicNurseMetaDescription("Jane", "Registered Nurse", null);
    expect(desc).toContain("Jane");
    expect(desc).toContain("Registered Nurse");
    expect(desc).not.toContain("Doe");
  });
});
