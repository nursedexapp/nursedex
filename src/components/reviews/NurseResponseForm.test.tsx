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

vi.mock("@/lib/reviews/nurse-actions", () => ({
  saveNurseResponse: vi.fn(),
  deleteNurseResponse: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { NurseResponseForm } from "./NurseResponseForm";
import { STALL_MS } from "@/components/ui/pending-button";
import {
  saveNurseResponse,
  deleteNurseResponse,
} from "@/lib/reviews/nurse-actions";
import { toast } from "sonner";

// #669 phase 5. This was `wait`: a nurse whose response hung was told to refresh.
// Both actions are plain UPDATEs on the review row (the response text, or
// clearing it), so repeating one lands on exactly the same result. The only
// reason it could not offer a retry was that a retry does not cancel the first
// request, and the hung one could land afterwards and contradict it. That guard
// exists now (#690).

const hung: Array<(value: unknown) => void> = [];

function hang<T>(): Promise<T> {
  return new Promise<T>((resolve) => {
    hung.push(resolve as (value: unknown) => void);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(async () => {
  await act(async () => {
    hung.splice(0).forEach((resolve) => resolve({ success: false }));
    await vi.advanceTimersByTimeAsync(0);
  });
  cleanup();
  vi.useRealTimers();
});

async function click(name: RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function openAndSave() {
  render(<NurseResponseForm reviewId="r1" existingResponse={null} />);
  await click(/respond/i);
  await act(async () => {
    fireEvent.change(screen.getByLabelText(/response/i), {
      target: { value: "Thank you for the kind words." },
    });
  });
  await act(async () => {
    fireEvent.submit(document.querySelector("form")!);
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe("posting a response", () => {
  it("blocks a second submit while the first is running", async () => {
    vi.mocked(saveNurseResponse).mockReturnValue(hang());
    await openAndSave();

    expect(saveNurseResponse).toHaveBeenCalledTimes(1);
  });

  it("offers a retry on a stall, because saving the same text twice is the same save", async () => {
    vi.mocked(saveNurseResponse).mockReturnValue(hang());
    await openAndSave();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STALL_MS);
    });

    const again = screen.getByRole("button", { name: /try again/i });
    expect(again).toBeEnabled();

    await click(/try again/i);

    expect(saveNurseResponse).toHaveBeenCalledTimes(2);
  });

  it("does not let the superseded save toast over the retry", async () => {
    let releaseFirst!: (v: unknown) => void;
    vi.mocked(saveNurseResponse)
      .mockReturnValueOnce(
        new Promise((r) => {
          releaseFirst = r as (v: unknown) => void;
        }),
      )
      .mockResolvedValueOnce({ success: true });

    await openAndSave();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STALL_MS);
    });
    await click(/try again/i);

    expect(toast.success).toHaveBeenCalledWith("Response posted");
    vi.mocked(toast.error).mockClear();

    await act(async () => {
      releaseFirst({ success: false });
      await vi.advanceTimersByTimeAsync(20);
    });

    expect(toast.error).not.toHaveBeenCalled();
  });

  it("still shows a real failure", async () => {
    vi.mocked(saveNurseResponse).mockResolvedValue({ success: false });
    await openAndSave();

    expect(toast.error).toHaveBeenCalledWith(
      "Could not save your response. Please try again.",
    );
  });
});

describe("deleting a response", () => {
  it("offers a retry on a stall, because deleting an already-deleted response is the same delete", async () => {
    vi.mocked(deleteNurseResponse).mockReturnValue(hang());
    render(
      <NurseResponseForm reviewId="r1" existingResponse="An old response" />,
    );

    await click(/edit response/i);
    await click(/^delete$/i);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STALL_MS);
    });

    await click(/try again/i);

    expect(deleteNurseResponse).toHaveBeenCalledTimes(2);
  });
});
