// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SkillsFields } from "./SkillsFields";

// #905. All three lists on this step became required, so the step has to say
// so and has to be able to show the refusal against the control it concerns.
// Before this, a nurse could leave every one of them empty, and the wizard
// let her past while the dashboard gate treated the same profile as
// unfinished and sent her back here for good.

afterEach(cleanup);

const values = {
  skills: [],
  availability_commitment: [],
  time_slots: [],
  rate_min: null,
  rate_max: null,
  has_transportation: false,
  covid_vaccinated: null,
  care_philosophy: "",
  additional_certs: [],
};

describe("SkillsFields", () => {
  it("says a skill has to be picked rather than inviting an empty answer", () => {
    render(<SkillsFields values={values} onChange={vi.fn()} errors={{}} />);
    expect(screen.getByText(/at least one/i)).toBeInTheDocument();
  });

  it("keeps marking the genuinely optional fields optional", () => {
    render(<SkillsFields values={values} onChange={vi.fn()} errors={{}} />);
    // The step marks what may be left blank, so the three required lists are
    // told apart from the rate, the philosophy and the certificates by their
    // labels carrying no "(optional)".
    expect(
      screen.getByText(/hourly rate range \(optional\)/i),
    ).toBeInTheDocument();
  });

  it.each([
    ["skills", "Pick at least one skill so families can find you"],
    [
      "availability_commitment",
      "Pick at least one availability so families know when you work",
    ],
    [
      "time_slots",
      "Pick at least one time slot so families know when you work",
    ],
  ])("shows the %s refusal against its own control", (field, message) => {
    render(
      <SkillsFields
        values={values}
        onChange={vi.fn()}
        errors={{ [field]: message }}
      />,
    );
    expect(screen.getByText(message)).toBeInTheDocument();
  });
});
