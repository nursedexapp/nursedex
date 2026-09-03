// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SurveyWizard } from "./SurveyWizard";
import { parseSearchParams } from "@/lib/nurses/search-params";
import { directoryFacets } from "../../../test/facets-fixture";
import type { DirectoryFacets } from "@/lib/nurses/facets";
import { TimeSlot } from "@/types/enums";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("posthog-js", () => ({
  default: { __loaded: false, capture: vi.fn() },
}));

afterEach(cleanup);

function wizard(step: number, facets: DirectoryFacets | null = directoryFacets()) {
  return render(
    <SurveyWizard
      initialFilters={parseSearchParams({})}
      initialStep={step}
      facets={facets}
    />,
  );
}

/**
 * #766. The survey's answers become a prefilled directory search, so an
 * option nobody is behind here is worse than a dead filter: the family
 * answers three questions and is taken to an empty results page.
 */
describe("SurveyWizard options come from the directory", () => {
  it("does not offer a language nobody in the directory speaks", () => {
    wizard(4);

    expect(screen.queryByRole("checkbox", { name: /Russian/ })).toBeNull();
    expect(screen.getByRole("checkbox", { name: "French" })).toBeInTheDocument();
  });

  it("asks the question without counts, unlike the directory's own filters", () => {
    wizard(4);

    // The survey is a conversation, not a filter panel. Deliberately no "(3)".
    expect(screen.queryByRole("checkbox", { name: /French \(3\)/ })).toBeNull();
  });

  it("does not offer a time slot no nurse works", () => {
    wizard(3, directoryFacets({ time_slots: [{ value: TimeSlot.WEEKDAYS, count: 44 }] }));

    expect(screen.getByRole("checkbox", { name: "Weekdays" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /Flexible/ })).toBeNull();
  });

  it("sends the family to the directory rather than asking questions it cannot answer", () => {
    wizard(1, null);

    expect(screen.getByText(/could not load/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /browse all nurses/i })).toHaveAttribute(
      "href",
      "/nurses",
    );
  });
});
