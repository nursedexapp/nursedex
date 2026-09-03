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
 *
 * Since #940 there are two ways to be missing, so it also has to say WHICH.
 * A nurse who has done what a previous version of this notice asked for, and
 * added a photo, must not be told her profile has no photo.
 */
const CARE = ["elderly"];
afterEach(cleanup);

describe("NotListedNotice", () => {
  it("tells a verified nurse with an empty profile that families cannot see her", () => {
    render(
      <NotListedNotice
        verificationStatus="verified"
        hasPhoto={false}
        bio={null}
        careTypes={CARE}
      />,
    );
    expect(screen.getByText(/cannot see you yet/i)).toBeInTheDocument();
    expect(screen.getByText(/photo or a short bio/i)).toBeInTheDocument();
  });

  it("says nothing to a nurse who is still being verified", () => {
    render(
      <NotListedNotice
        verificationStatus="pending"
        hasPhoto={false}
        bio={null}
        careTypes={CARE}
      />,
    );
    expect(screen.queryByText(/cannot see you yet/i)).toBeNull();
  });

  it("says nothing once she has a photo", () => {
    render(
      <NotListedNotice
        verificationStatus="verified"
        hasPhoto
        bio={null}
        careTypes={CARE}
      />,
    );
    expect(screen.queryByText(/cannot see you yet/i)).toBeNull();
  });

  it("says nothing once she has a bio", () => {
    render(
      <NotListedNotice
        verificationStatus="verified"
        hasPhoto={false}
        bio="Still writing this."
        careTypes={CARE}
      />,
    );
    expect(screen.queryByText(/cannot see you yet/i)).toBeNull();
  });

  it("names the care type when that is the only thing missing", () => {
    // She has done exactly what the nudge asked for. Telling her the profile
    // has no photo would be a false statement about her own profile, and the
    // one thing she still has to do would go unsaid.
    render(
      <NotListedNotice
        verificationStatus="verified"
        hasPhoto
        bio="Eight years with families in Queens."
        careTypes={[]}
      />,
    );
    expect(screen.getByText(/cannot see you yet/i)).toBeInTheDocument();
    expect(screen.getByText(/type of care/i)).toBeInTheDocument();
    expect(screen.queryByText(/photo or a short bio/i)).toBeNull();
  });

  it("names both when both are missing", () => {
    render(
      <NotListedNotice
        verificationStatus="verified"
        hasPhoto={false}
        bio={null}
        careTypes={[]}
      />,
    );
    expect(screen.getByText(/photo or a short bio/i)).toBeInTheDocument();
    expect(screen.getByText(/type of care/i)).toBeInTheDocument();
  });
});
