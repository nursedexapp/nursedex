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

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

const deletePhoto = vi.fn();
vi.mock("@/lib/profile/actions", () => ({
  deletePhoto: (path: string) => deletePhoto(path),
  requestPhotoUploadUrl: vi.fn(),
  confirmPhotoUpload: vi.fn(),
}));

// react-easy-crop is not what is under test, and it does not survive happy-dom.
vi.mock("./PhotoCropModal", () => ({
  PhotoCropModal: () => null,
}));

import { PhotoUpload } from "./PhotoUpload";
import { SLOW_MS, STALL_MS } from "@/components/ui/pending-button";
import { NurseTier } from "@/types/enums";

// Phase 2 of #443. Removing a photo is the one async control here that is not a
// labelled button: it is a 14px X in the corner of a thumbnail. A full stall
// panel cannot live inside it, so it borrows the shared phase hook and renders
// its own chrome: a spinner on the X while the delete runs, and one retry alert
// above the grid if the delete never comes back. Same three states, same clock,
// same primitive underneath.

beforeEach(() => {
  vi.useFakeTimers();
  toastError.mockReset();
  toastSuccess.mockReset();
  deletePhoto.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function setup() {
  const onChange = vi.fn();
  render(
    <PhotoUpload
      photos={["nurse/one.jpg"]}
      photoUrls={[null]}
      tier={NurseTier.FREE}
      onChange={onChange}
    />,
  );

  return {
    onChange,
    remove: async () => {
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /remove photo/i }));
        await vi.advanceTimersByTimeAsync(0);
      });
    },
  };
}

describe("removing a photo", () => {
  it("blocks a second click while the delete is running", async () => {
    deletePhoto.mockReturnValue(new Promise(() => {}));
    const { remove } = setup();

    await remove();

    expect(
      screen.getByRole("button", { name: /remove photo/i }),
    ).toBeDisabled();
    expect(deletePhoto).toHaveBeenCalledTimes(1);
  });

  it("says it is still working when the delete is merely slow", async () => {
    deletePhoto.mockReturnValue(new Promise(() => {}));
    const { remove } = setup();

    await remove();
    await advance(SLOW_MS);

    expect(screen.getByRole("status")).toHaveTextContent(/removing/i);
  });

  it("offers a retry when the delete stalls, and re-fires it", async () => {
    deletePhoto.mockReturnValue(new Promise(() => {}));
    const { remove } = setup();

    await remove();
    await advance(STALL_MS);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /try again/i }));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(deletePhoto).toHaveBeenCalledTimes(2);
    expect(deletePhoto).toHaveBeenLastCalledWith("nurse/one.jpg");
    // The clock restarts, so the retry is visibly a fresh attempt.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("lets the toast own a delete that actually fails, with no stall left over", async () => {
    let fail: (reason: Error) => void = () => {};
    deletePhoto.mockReturnValue(
      new Promise((_resolve, reject) => (fail = reject)),
    );
    const { remove, onChange } = setup();

    await remove();
    await advance(STALL_MS);
    expect(screen.getByRole("alert")).toBeInTheDocument();

    await act(async () => {
      fail(new Error("storage unreachable"));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(toastError).toHaveBeenCalledWith(
      "Could not remove photo. Please try again.",
    );
    // A failed delete must not drop the photo from the form.
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps a superseded delete quiet when it finally lands", async () => {
    // The bug that offering a retry creates. The first delete is hung and cannot
    // be aborted, so it is still out there when the retry succeeds. If it then
    // fails, it must not toast "could not remove photo" over a photo the retry
    // already removed, and if it succeeds it must not remove a second one.
    let failFirst: (reason: Error) => void = () => {};
    deletePhoto
      .mockReturnValueOnce(
        new Promise((_resolve, reject) => (failFirst = reject)),
      )
      .mockResolvedValueOnce(undefined);
    const { remove, onChange } = setup();

    await remove();
    await advance(STALL_MS);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /try again/i }));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(toastSuccess).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(1);

    // Now the first attempt finally gives up. Nobody hears it.
    await act(async () => {
      failFirst(new Error("storage unreachable"));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(toastError).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("clears the photo once the delete succeeds", async () => {
    deletePhoto.mockResolvedValue(undefined);
    const { remove, onChange } = setup();

    await remove();

    expect(onChange).toHaveBeenCalledWith([]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
