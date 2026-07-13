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
  // #674: behind a real dialog now. The stub is a trap for the native one.
  vi.stubGlobal("confirm", vi.fn());
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

async function click(name: RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
    await vi.advanceTimersByTimeAsync(0);
  });
}

/** Open the confirmation dialog and go through with it. */
async function clickRestore() {
  await click(/^restore$/i);
  await click(/restore this version/i);
}

describe("restoring a revision", () => {
  it("asks in a real dialog, and restores nothing until the admin confirms", async () => {
    render(<RestoreRevisionButton revisionId="rev1" postId="p1" />);

    await click(/^restore$/i);

    expect(screen.getByRole("dialog")).toHaveTextContent(/saved to history/i);
    expect(restoreRevision).not.toHaveBeenCalled();
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("restores nothing when the admin cancels", async () => {
    render(<RestoreRevisionButton revisionId="rev1" postId="p1" />);

    await click(/^restore$/i);
    await click(/cancel/i);

    expect(restoreRevision).not.toHaveBeenCalled();
  });

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

    await click(/restoring/i);

    expect(restoreRevision).toHaveBeenCalledTimes(1);
  });

  it("hands the button back when the restore really fails", async () => {
    vi.mocked(restoreRevision).mockResolvedValue({ success: false });
    render(<RestoreRevisionButton revisionId="rev1" postId="p1" />);

    await clickRestore();

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /restore this version/i }),
    ).toBeEnabled();
  });
});
