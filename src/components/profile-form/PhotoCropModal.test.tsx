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
import { useEffect } from "react";

// The cropper itself needs a real layout engine. Stub it, and report a crop area
// straight away so the confirm button is live.
vi.mock("react-easy-crop", () => ({
  default: ({
    onCropComplete,
  }: {
    onCropComplete: (a: unknown, b: unknown) => void;
  }) => {
    useEffect(() => {
      onCropComplete(
        { x: 0, y: 0, width: 100, height: 62 },
        { x: 0, y: 0, width: 100, height: 62 },
      );
    }, [onCropComplete]);
    return <div data-testid="cropper" />;
  },
}));
vi.mock("react-easy-crop/react-easy-crop.css", () => ({}));

import { PhotoCropModal } from "./PhotoCropModal";
import { STALL_MS } from "@/components/ui/pending-button";

// Phase 2 of #443. This is PhotoUpload's upload button: PhotoUpload owns the
// `uploading` flag and passes it down as `busy`. A stalled upload is safe to
// fire again (each attempt asks for a fresh signed URL and writes a fresh
// object), so `retry` mode.

beforeEach(() => {
  vi.useFakeTimers();
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

function setup(busy: boolean) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <PhotoCropModal
      imageSrc="data:image/png;base64,x"
      busy={busy}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />,
  );
  return { onConfirm, onCancel };
}

describe("the crop modal's upload button", () => {
  it("blocks a second upload while the first is running", () => {
    setup(true);

    expect(screen.getByRole("button", { name: /uploading/i })).toBeDisabled();
  });

  it("hands back a retry when the upload stalls, and re-uploads the same crop", async () => {
    const { onConfirm } = setup(true);

    await advance(STALL_MS);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith({
      x: 0,
      y: 0,
      width: 100,
      height: 62,
    });
  });

  it("uploads on click when idle", async () => {
    const { onConfirm } = setup(false);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Use photo" }));
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
