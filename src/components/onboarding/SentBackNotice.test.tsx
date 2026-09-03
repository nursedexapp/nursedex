// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SentBackNotice } from "./SentBackNotice";

// #905. A nurse whose profile is unfinished asks for /dashboard and is handed
// the wizard instead. She pressed nothing, so without a sentence the product
// simply refuses to open, and for the 24 nurses measured in that state on
// 2026-09-03 that refusal was the whole of their experience of it.

afterEach(cleanup);

describe("SentBackNotice", () => {
  it("says why she is looking at a form rather than her dashboard", () => {
    render(<SentBackNotice sentBack={true} />);
    expect(screen.getByRole("status")).toHaveTextContent(/dashboard/i);
    expect(screen.getByRole("status")).toHaveTextContent(/still/i);
  });

  it("stays silent for a nurse who came to the wizard herself", () => {
    render(<SentBackNotice sentBack={false} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
