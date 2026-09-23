// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

// next/link marks what it renders, so a test can tell a client side
// navigation from a plain link that loads the page.
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} data-client-nav="" {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/auth/SignOutButton", () => ({
  SignOutButton: () => null,
}));

import { MobileNav } from "./MobileNav";

const NAV = [
  { href: "/pricing", label: "Pricing" },
  { href: "/blog", label: "Blog" },
];

afterEach(cleanup);

function openMenu(isLoggedIn: boolean) {
  render(<MobileNav isLoggedIn={isLoggedIn} navItems={NAV} />);
  fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
}

// NURSEDEX-SITE-13: a client side navigation out of the public section, taken
// from this menu while it is open or closing, trips a React bug (error #482)
// that lands the person on "We hit a snag". A link that leaves the section
// loads the page instead, so that path is never taken.
describe("MobileNav links that leave the public section", () => {
  it("loads the page for Dashboard", async () => {
    openMenu(true);
    const link = await screen.findByRole("link", { name: "Dashboard" });
    expect(link).toHaveAttribute("href", "/dashboard");
    expect(link).not.toHaveAttribute("data-client-nav");
  });

  it("loads the page for Log in and Sign up", async () => {
    openMenu(false);
    for (const [name, href] of [
      ["Log in", "/login"],
      ["Sign up", "/signup"],
    ]) {
      const link = await screen.findByRole("link", { name });
      expect(link).toHaveAttribute("href", href);
      expect(link).not.toHaveAttribute("data-client-nav");
    }
  });

  it("keeps links within the section as client side navigations", async () => {
    openMenu(false);
    const link = await screen.findByRole("link", { name: "Pricing" });
    expect(link).toHaveAttribute("data-client-nav");
  });
});
