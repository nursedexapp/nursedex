// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const h = vi.hoisted(() => {
  const state = { selects: [] as string[], nurse: null as unknown };

  function builder(table: string) {
    const b: Record<string, unknown> = {};
    b.select = (columns: string) => {
      state.selects.push(`${table}:${columns}`);
      return b;
    };
    b.eq = () => b;
    b.insert = () => b;
    b.maybeSingle = () =>
      Promise.resolve({
        data:
          table === "nurse_profiles"
            ? state.nurse
            : { token: "tok-1" },
      });
    b.single = () => Promise.resolve({ data: { token: "tok-1" }, error: null });
    return b;
  }

  return { state, builder };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => h.builder(table),
  }),
}));
vi.mock("@/lib/nurses/visibility", () => ({
  applyVisibleNurseFilter: (query: unknown) => query,
}));
vi.mock("@/components/reviews/ExternalReviewForm", () => ({
  ExternalReviewForm: () => null,
}));

import ReviewLinkPage from "./page";

describe("public review page query", () => {
  beforeEach(() => {
    h.state.selects = [];
    h.state.nurse = {
      user_id: "n1",
      slug: "jane-smith-rn",
      credential: "rn",
      users: { first_name: "Jane" },
    };
  });

  it("renders the nurse's first name, so the page still has what it needs", async () => {
    const html = renderToStaticMarkup(
      await ReviewLinkPage({ params: Promise.resolve({ slug: "jane-smith-rn" }) }),
    );
    expect(html).toContain("Review Jane");
  });

  it("does not ask the database for last_name, which the page never renders", async () => {
    await ReviewLinkPage({ params: Promise.resolve({ slug: "jane-smith-rn" }) });

    const nurseSelect = h.state.selects.find((s) =>
      s.startsWith("nurse_profiles:"),
    );
    expect(nurseSelect).toBeDefined();
    expect(nurseSelect).toContain("first_name");
    expect(nurseSelect).not.toContain("last_name");
  });
});
