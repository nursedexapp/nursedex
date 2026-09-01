// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

// One card, two callers. The profile page server-renders it for a family who
// has already revealed this nurse, and RevealCTA's wrapper renders the very
// same card the moment the reveal action hands the contact back (#831). They
// were one copy of the markup inside the profile until the second caller
// needed it, and two copies would have drifted the moment either changed.
import { ContactDetailsCard } from "./ContactDetailsCard";

afterEach(cleanup);

describe("ContactDetailsCard", () => {
  it("offers the email as a mailto link", () => {
    render(
      <ContactDetailsCard
        contact={{
          email: "nurse@example.com",
          phone: null,
          communication_preference: null,
        }}
      />,
    );

    const link = screen.getByRole("link", { name: /nurse@example.com/ });
    expect(link).toHaveAttribute(
      "href",
      "mailto:nurse@example.com?subject=NurseDex%20Inquiry",
    );
  });

  it("offers both a call and a text link for the phone", () => {
    render(
      <ContactDetailsCard
        contact={{
          email: null,
          phone: "555-0100",
          communication_preference: null,
        }}
      />,
    );

    expect(screen.getByRole("link", { name: /call/i })).toHaveAttribute(
      "href",
      "tel:555-0100",
    );
    expect(screen.getByRole("link", { name: /text/i })).toHaveAttribute(
      "href",
      "sms:555-0100",
    );
  });

  it("says how the nurse prefers to be contacted, in words", () => {
    render(
      <ContactDetailsCard
        contact={{
          email: "nurse@example.com",
          phone: null,
          communication_preference: "text",
        }}
      />,
    );

    expect(screen.getByText(/prefers contact by text/i)).toBeInTheDocument();
  });

  // A nurse who gave no phone must not be handed a "Call" link to nothing, and
  // an unrecognised preference is a value this card cannot describe, so it says
  // nothing rather than printing the raw enum at the family.
  it("shows nothing for the details the nurse has not given", () => {
    render(
      <ContactDetailsCard
        contact={{
          email: "nurse@example.com",
          phone: null,
          communication_preference: "carrier_pigeon",
        }}
      />,
    );

    expect(screen.queryByRole("link", { name: /call|text/i })).toBeNull();
    expect(screen.queryByText(/prefers contact by/i)).toBeNull();
  });
});
