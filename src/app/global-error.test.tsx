// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";

const h = vi.hoisted(() => ({ captureException: vi.fn() }));

vi.mock("@sentry/nextjs", () => ({ captureException: h.captureException }));

import GlobalError from "./global-error";

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("GlobalError boundary", () => {
  it("reports the error to Sentry", () => {
    const error = Object.assign(new Error("boom"), { digest: "xyz789" });
    render(<GlobalError error={error} />);

    expect(h.captureException).toHaveBeenCalledWith(error);
  });
});
