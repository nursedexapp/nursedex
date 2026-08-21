// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SavedListUnavailableNotice } from "./SavedListUnavailableNotice";

afterEach(cleanup);

describe("SavedListUnavailableNotice", () => {
  it("says nothing when the saved list read fine", () => {
    const { container } = render(
      <SavedListUnavailableNotice show={false} withoutSavedHref="/nurses" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  // Showing every nurse under a filter the family switched on is a wrong
  // answer presented as a right one. The notice is what makes it honest.
  it("says the filter was not applied", () => {
    render(
      <SavedListUnavailableNotice
        show
        withoutSavedHref="/nurses?credential=rn"
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      /not limited to nurses you saved/,
    );
  });

  it("offers a way out that keeps the other filters", () => {
    render(
      <SavedListUnavailableNotice
        show
        withoutSavedHref="/nurses?credential=rn"
      />,
    );
    expect(
      screen.getByRole("link", { name: "browse everyone" }),
    ).toHaveAttribute("href", "/nurses?credential=rn");
  });

  it("suggests trying again, since this is usually momentary", () => {
    render(<SavedListUnavailableNotice show withoutSavedHref="/nurses" />);
    expect(screen.getByRole("status")).toHaveTextContent(/Try again/);
  });
});
