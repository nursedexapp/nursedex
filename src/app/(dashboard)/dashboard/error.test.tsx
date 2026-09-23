// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";

const h = vi.hoisted(() => ({ captureException: vi.fn() }));

vi.mock("@sentry/nextjs", () => ({ captureException: h.captureException }));

import DashboardError from "./error";

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("DashboardError boundary", () => {
  // It tells the person "Our team has been notified", so it has to be true:
  // this boundary catches every dashboard page error before the root one can.
  it("reports the error to Sentry", () => {
    const error = Object.assign(new Error("boom"), { digest: "abc123" });
    render(<DashboardError error={error} />);

    expect(h.captureException).toHaveBeenCalledWith(error);
  });

  it("reports an error that carries no digest, and shows no empty ref", () => {
    const error = new Error("no digest");
    const { queryByText } = render(<DashboardError error={error} />);

    expect(h.captureException).toHaveBeenCalledWith(error);
    expect(queryByText(/Error ref/)).toBeNull();
  });

  // This screen is the last thing between the person and a blank page, so a
  // Sentry failure must not take it down with it, and must not vanish either.
  it("still shows the screen, and says so in the console, when reporting fails", () => {
    const reportFailure = new Error("sentry down");
    h.captureException.mockImplementationOnce(() => {
      throw reportFailure;
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const { getByRole } = render(<DashboardError error={new Error("boom")} />);

    expect(
      getByRole("heading", { name: /Something on your dashboard/ }),
    ).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledWith(
      "[dashboard-error-boundary] could not report to Sentry",
      reportFailure,
    );
    consoleError.mockRestore();
  });
});
