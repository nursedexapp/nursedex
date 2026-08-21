// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { UnlocatableZipNotice } from "./UnlocatableZipNotice";

afterEach(cleanup);

describe("UnlocatableZipNotice", () => {
  it("renders nothing when there is no unlocatable zip", () => {
    const { container } = render(
      <UnlocatableZipNotice zip={null} hadDistanceFilter />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("names the zip it could not locate", () => {
    render(<UnlocatableZipNotice zip="06830" hadDistanceFilter={false} />);
    expect(screen.getByRole("status")).toHaveTextContent("06830");
  });

  // The two cases lose different things, so they may not share one sentence.
  it("says the distance was ignored when a radius was chosen", () => {
    render(<UnlocatableZipNotice zip="06830" hadDistanceFilter />);
    expect(screen.getByRole("status")).toHaveTextContent(
      /ignored the distance you chose/,
    );
  });

  it("claims no dropped filter when no radius was chosen", () => {
    render(<UnlocatableZipNotice zip="06830" hadDistanceFilter={false} />);
    const notice = screen.getByRole("status");
    expect(notice).not.toHaveTextContent(/ignored the distance/);
    expect(notice).toHaveTextContent(/do not show how far away they are/);
  });

  it("tells the family what to do next", () => {
    render(<UnlocatableZipNotice zip="06830" hadDistanceFilter />);
    expect(screen.getByRole("status")).toHaveTextContent(/Check the zip code/);
  });
});
