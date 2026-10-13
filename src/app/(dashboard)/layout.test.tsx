// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  usePathname: () => "/dashboard",
}));
vi.mock("@/lib/auth/helpers", () => ({ getCurrentUser: async () => null }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/components/auth/SignOutButton", () => ({
  SignOutButton: () => null,
}));

import DashboardLayout from "./layout";

describe("dashboard layout", () => {
  // The mobile nav is fixed over the bottom of the page, and its labels wrap
  // to two lines on a phone, so the page clears the height the nav publishes
  // rather than a constant. 4rem only until the nav has measured itself.
  it("clears the mobile nav by its measured height, and nothing at lg", async () => {
    const html = renderToStaticMarkup(
      await DashboardLayout({ children: <p>page</p> }),
    );
    const main = html.match(/<main class="([^"]*)"/)?.[1] ?? "";
    const footer = html.match(/<footer class="([^"]*)"/)?.[1] ?? "";
    expect(main.split(" ")).toEqual(
      expect.arrayContaining(["pb-[var(--bottom-nav-height,4rem)]", "lg:pb-0"]),
    );
    expect(footer.split(" ")).toEqual(
      expect.arrayContaining(["mb-[var(--bottom-nav-height,4rem)]", "lg:mb-0"]),
    );
    expect(`${main} ${footer}`).not.toMatch(/\b(pb|mb)-16\b/);
  });
});
