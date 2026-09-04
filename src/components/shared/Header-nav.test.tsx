// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { UserRole } from "@/types/enums";

const h = vi.hoisted(() => ({
  user: null as { id: string; role: UserRoleValue | null } | null,
}));
type UserRoleValue = `${UserRole}`;

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/helpers", () => ({
  getCurrentUser: async () => h.user,
}));
// The mobile sheet is a client component whose contents only exist once it is
// opened, so it cannot answer for the nav in a static render. It is driven by
// the same navItems array asserted here; nav-items.test.ts covers the list
// itself.
vi.mock("./MobileNav", () => ({
  MobileNav: () => null,
}));

import { Header } from "./Header";

async function markup() {
  return renderToStaticMarkup(await Header());
}

describe("Header navigation", () => {
  beforeEach(() => {
    h.user = null;
  });

  it("offers Find a Nurse to a signed out visitor", async () => {
    expect(await markup()).toContain("Find a Nurse");
  });

  it("offers Find a Nurse to a signed in family", async () => {
    h.user = { id: "u1", role: UserRole.FAMILY };
    expect(await markup()).toContain("Find a Nurse");
  });

  it("does not offer Find a Nurse to a signed in nurse", async () => {
    h.user = { id: "u1", role: UserRole.NURSE };
    const html = await markup();
    expect(html).not.toContain("Find a Nurse");
    expect(html).not.toContain('href="/nurses"');
  });

  it("still gives a signed in nurse their dashboard and the blog", async () => {
    h.user = { id: "u1", role: UserRole.NURSE };
    const html = await markup();
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain('href="/blog"');
  });
});
