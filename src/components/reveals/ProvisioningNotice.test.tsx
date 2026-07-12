// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  act,
  cleanup,
  render,
  screen,
  fireEvent,
} from "@testing-library/react";

const h = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: h.refresh }),
}));

import { ProvisioningNotice } from "./ProvisioningNotice";

// Advancing 2500ms*6 in one jump doesn't give React a chance to commit the
// state update from tick N and re-run the effect that schedules tick N+1
// before fake timers tries to fire it; stepping one interval at a time
// (each in its own act()) lets each render/effect cycle actually happen.
async function advancePolls(count: number) {
  for (let i = 0; i < count; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  h.refresh.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ProvisioningNotice", () => {
  it("shows a working state immediately", () => {
    render(<ProvisioningNotice />);
    expect(
      screen.getByText(/Finishing your subscription/i),
    ).toBeInTheDocument();
  });

  it("polls via router.refresh on an interval while still working", async () => {
    render(<ProvisioningNotice />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });

    expect(h.refresh).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText(/Finishing your subscription/i),
    ).toBeInTheDocument();
  });

  it("gives up and shows a stalled, actionable state after enough failed polls", async () => {
    render(<ProvisioningNotice />);

    await advancePolls(6);

    expect(
      screen.getByText(/taking longer than expected/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Refresh now/i }),
    ).toBeInTheDocument();
  });

  it("lets the user manually retry from the stalled state", async () => {
    render(<ProvisioningNotice />);
    await advancePolls(6);
    h.refresh.mockClear();

    fireEvent.click(screen.getByRole("button", { name: /Refresh now/i }));

    expect(h.refresh).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText(/Finishing your subscription/i),
    ).toBeInTheDocument();
  });
});
