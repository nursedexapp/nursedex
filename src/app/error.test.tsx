// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";

const h = vi.hoisted(() => ({ captureException: vi.fn() }));

vi.mock("@sentry/nextjs", () => ({ captureException: h.captureException }));

import RootError from "./error";

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("RootError boundary", () => {
  it("reports the error to Sentry", () => {
    const error = Object.assign(new Error("boom"), { digest: "abc123" });
    render(<RootError error={error} />);

    expect(h.captureException).toHaveBeenCalledWith(error);
  });
});
