// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { NotListedNotice } from "./NotListedNotice";

/**
 * The dashboard's not-listed state cannot reach the nurses it was written for:
 * a nurse with no photo and no bio has not finished onboarding, and the
 * dashboard sends her into the wizard before that state renders. This notice
 * is the same fact said on the screen she actually lands on (#732).
 *
 * It must stay silent for a nurse who is not verified yet, because she is not
 * missing from the directory for this reason, she is waiting on a review.
 */
afterEach(cleanup);

describe("NotListedNotice", () => {
  it("tells a verified nurse with an empty profile that families cannot see her", () => {
    render(
      <NotListedNotice
        verificationStatus="verified"
        hasPhoto={false}
        bio={null}
      />,
    );
    expect(screen.getByText(/cannot see you yet/i)).toBeInTheDocument();
  });

  it("says nothing to a nurse who is still being verified", () => {
    render(
      <NotListedNotice
        verificationStatus="pending"
        hasPhoto={false}
        bio={null}
      />,
    );
    expect(screen.queryByText(/cannot see you yet/i)).toBeNull();
  });

  it("says nothing once she has a photo", () => {
    render(
      <NotListedNotice verificationStatus="verified" hasPhoto bio={null} />,
    );
    expect(screen.queryByText(/cannot see you yet/i)).toBeNull();
  });

  it("says nothing once she has a bio", () => {
    render(
      <NotListedNotice
        verificationStatus="verified"
        hasPhoto={false}
        bio="Still writing this."
      />,
    );
    expect(screen.queryByText(/cannot see you yet/i)).toBeNull();
  });
});
