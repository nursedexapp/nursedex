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

vi.mock("@/lib/admin/role-actions", () => ({
  promoteToAdmin: vi.fn(),
  demoteAdmin: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { PromoteForm, DemoteButton } from "./AdminRoleControls";
import { STALL_MS } from "@/components/ui/pending-button";
import { promoteToAdmin, demoteAdmin } from "@/lib/admin/role-actions";

// Phase 4 of #443. Granting and revoking admin access is the highest-privilege
// write in the app: `wait` mode, never a retry on a stall.

const hung: Array<(value: unknown) => void> = [];

function hang<T>(): Promise<T> {
  return new Promise<T>((resolve) => {
    hung.push(resolve as (value: unknown) => void);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.stubGlobal("confirm", () => true);
});

afterEach(async () => {
  await act(async () => {
    hung.splice(0).forEach((resolve) => resolve({ success: false }));
    await vi.advanceTimersByTimeAsync(0);
  });
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("granting a role", () => {
  async function submitPromote() {
    render(<PromoteForm />);
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/user email/i), {
        target: { value: "someone@example.com" },
      });
    });
    await act(async () => {
      fireEvent.submit(document.querySelector("form")!);
      await vi.advanceTimersByTimeAsync(0);
    });
  }

  it("stays disabled on a stall and never grants the role twice", async () => {
    vi.mocked(promoteToAdmin).mockReturnValue(hang());
    await submitPromote();
    await advance(STALL_MS);

    expect(screen.getByRole("alert")).toHaveTextContent(/refresh/i);
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();

    await act(async () => {
      fireEvent.submit(document.querySelector("form")!);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(promoteToAdmin).toHaveBeenCalledTimes(1);
  });
});

describe("revoking a role", () => {
  it("stays disabled on a stall and never demotes twice", async () => {
    vi.mocked(demoteAdmin).mockReturnValue(hang());
    render(<DemoteButton userId="u1" email="a@b.c" isSelf={false} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^demote$/i }));
      await vi.advanceTimersByTimeAsync(0);
    });
    await advance(STALL_MS);

    expect(screen.getByRole("alert")).toHaveTextContent(/refresh/i);
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
    expect(screen.getByRole("button", { name: /demoting/i })).toBeDisabled();
    expect(demoteAdmin).toHaveBeenCalledTimes(1);
  });
});
