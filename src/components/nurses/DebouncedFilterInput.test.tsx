// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { DebouncedFilterInput, parseFilterInt } from "./DebouncedFilterInput";

const flush = () =>
  act(() => {
    vi.advanceTimersByTime(1000);
  });

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("DebouncedFilterInput", () => {
  it("commits once the typing pauses", () => {
    const onCommit = vi.fn();
    render(<DebouncedFilterInput value="" onCommit={onCommit} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "40" } });
    expect(onCommit).not.toHaveBeenCalled();
    flush();
    expect(onCommit).toHaveBeenCalledWith("40");
  });

  it("keeps every digit of a fast entry", () => {
    const onCommit = vi.fn();
    render(<DebouncedFilterInput value="" onCommit={onCommit} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "1" } });
    fireEvent.change(input, { target: { value: "15" } });
    flush();
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("15");
  });

  // The regression this exists for. Inside a popover, closing it (Escape, or
  // clicking away) unmounts the input. Dropping the pending commit throws away
  // what the family typed, with nothing on screen to say it happened.
  it("commits what was typed when it unmounts before the pause is up", () => {
    const onCommit = vi.fn();
    const { unmount } = render(
      <DebouncedFilterInput value="" onCommit={onCommit} />,
    );
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "40" } });
    unmount();
    expect(onCommit).toHaveBeenCalledWith("40");
  });

  it("flushes the latest text, not an earlier keystroke", () => {
    const onCommit = vi.fn();
    const { unmount } = render(
      <DebouncedFilterInput value="" onCommit={onCommit} />,
    );
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "1" } });
    fireEvent.change(input, { target: { value: "15" } });
    unmount();
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("15");
  });

  it("commits an emptied field on unmount, so a filter can be cleared by deleting it", () => {
    const onCommit = vi.fn();
    const { unmount } = render(
      <DebouncedFilterInput value="40" onCommit={onCommit} />,
    );
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "" } });
    unmount();
    expect(onCommit).toHaveBeenCalledWith("");
  });

  // Unmounting with nothing typed must not fire a commit: that would push a
  // redundant navigation every time a popover closes.
  it("commits nothing on unmount when nothing was typed", () => {
    const onCommit = vi.fn();
    const { unmount } = render(
      <DebouncedFilterInput value="40" onCommit={onCommit} />,
    );
    unmount();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("does not commit twice when the pause elapses and then it unmounts", () => {
    const onCommit = vi.fn();
    const { unmount } = render(
      <DebouncedFilterInput value="" onCommit={onCommit} />,
    );
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "40" } });
    flush();
    unmount();
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("sanitises as it goes", () => {
    const onCommit = vi.fn();
    render(
      <DebouncedFilterInput
        value=""
        onCommit={onCommit}
        sanitize={(raw) => raw.replace(/\D/g, "").slice(0, 5)}
      />,
    );
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "11a779x" } });
    expect(input).toHaveValue("11779");
    flush();
    expect(onCommit).toHaveBeenCalledWith("11779");
  });

  it("adopts an external change when nothing is being typed", () => {
    const { rerender } = render(
      <DebouncedFilterInput value="40" onCommit={vi.fn()} />,
    );
    rerender(<DebouncedFilterInput value="" onCommit={vi.fn()} />);
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it("does not stamp on an edit in flight", () => {
    const { rerender } = render(
      <DebouncedFilterInput value="" onCommit={vi.fn()} />,
    );
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "4" } });
    rerender(<DebouncedFilterInput value="99" onCommit={vi.fn()} />);
    expect(screen.getByRole("textbox")).toHaveValue("4");
  });
});

describe("parseFilterInt", () => {
  it("reads a number", () => {
    expect(parseFilterInt("40")).toBe(40);
  });

  it("treats an empty field as not set", () => {
    expect(parseFilterInt("  ")).toBeUndefined();
  });

  it("treats unreadable text as not set rather than as NaN", () => {
    expect(parseFilterInt("abc")).toBeUndefined();
  });
});
