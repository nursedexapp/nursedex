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
import { BLOCK_PII } from "@/components/ui/private";

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
  // BLOCK, not mask (#379). This card is the one thing a family pays to
  // unlock, and the phone number and email are not only text: they sit inside
  // href="tel:...", href="sms:..." and href="mailto:...". Session replay
  // records attributes too, so masking the visible text would leave both in
  // plain sight in the link targets. Blocking drops the element entirely.
  //
  // The assertion is on the card BOTH callers render (#831), because the
  // profile page and the just-revealed client card are the same markup. A
  // guard on only one of them would pass while the other leaked.
  it("keeps the revealed contact out of session replay", () => {
    render(
      <ContactDetailsCard
        contact={{
          email: "nurse@example.com",
          phone: "555-0100",
          communication_preference: "text",
        }}
      />,
    );

    for (const name of [/nurse@example.com/, /call 555-0100/i, /text 555-0100/i]) {
      const link = screen.getByRole("link", { name });
      expect(
        link.closest(`.${BLOCK_PII}`),
        `${link.getAttribute("href")} is recorded into session replay`,
      ).not.toBeNull();
    }
  });

  // Masking is the weaker tool and it is not enough here: it leaves the value
  // in the href. If someone downgrades the block to a mask, this fails.
  it("blocks rather than masks, because the values are in attributes", () => {
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
    expect(link.closest(`.${BLOCK_PII}`)).not.toBeNull();
  });
});
