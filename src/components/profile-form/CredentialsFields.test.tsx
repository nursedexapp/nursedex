// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CredentialsFields } from "./CredentialsFields";
import { NurseTier } from "@/types/enums";

afterEach(cleanup);

function renderWith(credential: string) {
  return render(
    <CredentialsFields
      values={{
        credential,
        license_number: "",
        care_types: [],
        primary_care_type: null,
      }}
      tier={NurseTier.FREE}
      onChange={() => {}}
      errors={{}}
    />,
  );
}

describe("CredentialsFields license/certification field", () => {
  it("labels the field 'License number' for licensed credentials", () => {
    renderWith("rn");
    expect(screen.getByText("License number")).toBeInTheDocument();
    expect(screen.queryByText("(optional)")).not.toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(
        "Your NY State license or certification number",
      ),
    ).toBeInTheDocument();
  });

  // Optional since 2026-09-22: the number is no longer required of a CNA, so
  // a form that still presented it as required would ask for what we refuse
  // to demand.
  it("labels the field 'Certification number' and marks it optional for CNAs", () => {
    renderWith("cna");
    expect(screen.getByText("Certification number")).toBeInTheDocument();
    expect(screen.getByText("(optional)")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Optional for Certified Nursing Assistants"),
    ).toBeInTheDocument();
  });

  it("marks the field optional for HHAs", () => {
    renderWith("hha");
    expect(
      screen.getByText(/License or certification number/),
    ).toBeInTheDocument();
    expect(screen.getByText("(optional)")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Optional for Home Health Aides"),
    ).toBeInTheDocument();
  });
});
