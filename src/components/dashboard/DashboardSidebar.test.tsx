// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
vi.mock("@/components/auth/SignOutButton", () => ({ SignOutButton: () => null }));

import { DashboardSidebar } from "./DashboardSidebar";

afterEach(cleanup);

const published = () => document.documentElement.style.getPropertyValue("--bottom-nav-height");

describe("DashboardSidebar mobile nav", () => {
  // The cookie bar sits on top of this nav, so the nav publishes its real
  // height: the labels wrap to two lines on a phone, which no constant knows.
  it("publishes its height for the cookie bar to sit above, and withdraws it when it goes", () => {
    const { unmount } = render(<DashboardSidebar role="nurse" />);
    expect(published()).toMatch(/^\d+px$/);
    unmount();
    expect(published()).toBe("");
  });
});
