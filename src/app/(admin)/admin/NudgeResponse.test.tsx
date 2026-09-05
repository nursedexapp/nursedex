// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NudgeResponse } from "./NudgeResponse";
import type { NudgeCohort } from "@/lib/nurses/nudge-response";

/**
 * #947. The panel has three states a person can meet, and two of them are the
 * ones that go wrong quietly: a send that has not happened yet, and a read
 * that fell over. Both would otherwise render as nobody having acted, which
 * reads as the approach having failed.
 */
const cohort = (over: Partial<NudgeCohort> = {}): NudgeCohort => ({
  emailType: "not_listed_nudge",
  label: "Not listed nudge",
  acted: "become listed in the directory",
  told: 18,
  firstSentAt: "2026-09-04T14:50:00Z",
  lastSentAt: "2026-09-04T14:55:00Z",
  moved: 3,
  ...over,
});

afterEach(cleanup);

describe("the nudge response panel", () => {
  it("shows how many of the people told have acted", () => {
    render(<NudgeResponse response={{ ok: true, cohorts: [cohort()] }} />);

    expect(screen.getByText("3 of 18")).toBeInTheDocument();
    expect(
      screen.getByText(
        /have become listed in the directory since being asked/i,
      ),
    ).toBeInTheDocument();
  });

  it("says a send has not happened rather than showing nobody acting", () => {
    render(
      <NudgeResponse
        response={{
          ok: true,
          cohorts: [
            cohort({ told: 0, moved: 0, firstSentAt: null, lastSentAt: null }),
          ],
        }}
      />,
    );

    expect(screen.getByText(/nothing to measure/i)).toBeInTheDocument();
    expect(screen.queryByText("0 of 0")).not.toBeInTheDocument();
  });

  it("says the numbers are unknown rather than zero when a read failed", () => {
    render(
      <NudgeResponse
        response={{
          ok: false,
          failed: "who was told",
          message: "connection reset",
        }}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(/unknown right now/i);
    expect(screen.getByRole("alert")).toHaveTextContent("connection reset");
  });

  it("names both days when the send spanned two", () => {
    render(
      <NudgeResponse
        response={{
          ok: true,
          cohorts: [
            cohort({
              firstSentAt: "2026-09-03T23:50:00Z",
              lastSentAt: "2026-09-04T00:10:00Z",
            }),
          ],
        }}
      />,
    );

    expect(screen.getByText("Sent Sep 3 to Sep 4")).toBeInTheDocument();
  });

  it("says it is measuring movement, not cause", () => {
    // The email only goes to nurses in the state it describes, so being out of
    // that state is real movement; that it was the email is not something this
    // can know, and a panel that implied it would be asserting an inference.
    render(<NudgeResponse response={{ ok: true, cohorts: [cohort()] }} />);

    expect(
      screen.getByText(/not who moved because of it/i),
    ).toBeInTheDocument();
  });
});
