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
import { useInFlight } from "@/components/ui/use-in-flight";
import { PendingButton } from "@/components/ui/pending-button";
import { STALL_MS } from "@/components/ui/pending-button";

// Phase 5 of #443. PostEditorForm drives Publish now, Schedule and Save draft
// from one flag, so pressing "Save draft" also greyed "Publish now" into looking
// like the thing that was running. This pins the shape it now uses: keyed
// in-flight state, wait mode, one live label.
//
// The editor itself pulls in Tiptap, a preview-draft store and image uploads,
// none of which this behaviour depends on. The wiring is what matters, so it is
// exercised directly rather than through 700 lines of editor chrome.

const hung: Array<() => void> = [];

function hang() {
  return new Promise<void>((resolve) => hung.push(resolve));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(async () => {
  await act(async () => {
    hung.splice(0).forEach((r) => r());
    await vi.advanceTimersByTimeAsync(0);
  });
  cleanup();
  vi.useRealTimers();
});

const save = vi.fn();

function EditorActions() {
  const { inFlight, busy, run } = useInFlight<
    "publish" | "schedule" | "draft"
  >();

  const submit = (intent: "publish" | "schedule" | "draft") => {
    if (busy) return;
    run(intent, async () => {
      await save(intent);
    });
  };

  return (
    <div>
      <PendingButton
        pending={inFlight === "publish"}
        mode="wait"
        idleLabel="Publish now"
        workingLabel="Publishing..."
        disabled={busy}
        onClick={() => submit("publish")}
      />
      <PendingButton
        pending={inFlight === "draft"}
        mode="wait"
        idleLabel="Save draft"
        workingLabel="Saving..."
        disabled={busy}
        onClick={() => submit("draft")}
      />
    </div>
  );
}

async function click(name: RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe("the post editor's action row", () => {
  it("shows the work on the button that was pressed, not on all three", async () => {
    save.mockReturnValue(hang());
    render(<EditorActions />);

    await click(/save draft/i);

    expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();
    // Publish keeps its own label. It just cannot be pressed.
    expect(screen.getByRole("button", { name: /publish now/i })).toBeDisabled();
  });

  it("cannot publish while a draft save is still in flight", async () => {
    save.mockReturnValue(hang());
    render(<EditorActions />);

    await click(/save draft/i);
    await click(/publish now/i);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("draft");
  });

  it("stays disabled on a stall and never offers a retry", async () => {
    save.mockReturnValue(hang());
    render(<EditorActions />);

    await click(/save draft/i);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STALL_MS);
    });

    expect(screen.getByRole("alert")).toHaveTextContent(/refresh/i);
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
    expect(save).toHaveBeenCalledTimes(1);
  });
});
