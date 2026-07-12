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

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/blog/actions", () => ({ restoreRevision: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { RestoreRevisionButton } from "./RestoreRevisionButton";
import { STALL_MS } from "@/components/ui/pending-button";
import { restoreRevision } from "@/lib/blog/actions";

// Phase 4 of #443. Restoring writes the post's current content to history and
// then replaces it, so a second fire adds another history entry: `wait` mode.

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

async function clickRestore(name: RegExp = /^restore$/i) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe("restoring a revision", () => {
  it("blocks a second restore while the first is running", async () => {
    vi.mocked(restoreRevision).mockReturnValue(hang());
    render(<RestoreRevisionButton revisionId="rev1" postId="p1" />);

    await clickRestore();

    expect(screen.getByRole("button", { name: /restoring/i })).toBeDisabled();
    expect(restoreRevision).toHaveBeenCalledTimes(1);
  });

  it("stays disabled on a stall and never writes a second history entry", async () => {
    vi.mocked(restoreRevision).mockReturnValue(hang());
    render(<RestoreRevisionButton revisionId="rev1" postId="p1" />);

    await clickRestore();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STALL_MS);
    });

    expect(screen.getByRole("alert")).toHaveTextContent(/refresh/i);
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();

    await clickRestore(/restoring/i);

    expect(restoreRevision).toHaveBeenCalledTimes(1);
  });

  it("hands the button back when the restore really fails", async () => {
    vi.mocked(restoreRevision).mockResolvedValue({ success: false });
    render(<RestoreRevisionButton revisionId="rev1" postId="p1" />);

    await clickRestore();

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^restore$/i })).toBeEnabled();
  });
});
