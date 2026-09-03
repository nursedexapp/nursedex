// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";

import { StepLayout } from "./StepLayout";

afterEach(cleanup);

describe("StepLayout", () => {
  it("shows a banner above the step's own fields", () => {
    render(
      <StepLayout
        step={1}
        title="Basics"
        description="About you"
        onNext={() => {}}
        banner={<p>You are not showing in search</p>}
      >
        <label htmlFor="x">Your name</label>
      </StepLayout>,
    );
    expect(screen.getByText(/not showing in search/i)).toBeInTheDocument();
  });

  it("renders nothing extra when there is no banner", () => {
    const { container } = render(
      <StepLayout step={1} title="Basics" description="About you" onNext={() => {}}>
        <label htmlFor="x">Your name</label>
      </StepLayout>,
    );
    expect(container.textContent).not.toMatch(/not showing in search/i);
  });
});

describe("the onboarding wizard's steps", () => {
  // The notice telling a verified nurse that families cannot see her has to
  // appear wherever she lands, not only on the last step (#732). 22 of the 40
  // nurses in that state stopped before step 3, so a notice on step 4 alone
  // would miss more than half the people it is for. Counted from the source
  // rather than listed, so a sixth step cannot quietly skip it.
  it("every step carries the banner", () => {
    const source = readFileSync(
      "src/app/(dashboard)/dashboard/onboarding/OnboardingWizard.tsx",
      "utf8",
    );
    const steps = source.match(/<StepLayout\b/g) ?? [];
    const banners = source.match(/\bbanner=\{/g) ?? [];
    expect(steps.length).toBeGreaterThan(0);
    expect(banners.length).toBe(steps.length);
  });
});
