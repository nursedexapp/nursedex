// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { useRef } from "react";
import { useHeightVariable } from "./use-height-variable";

// happy-dom does no layout, so offsetHeight is 0 unless given one, and its
// ResizeObserver never reports. The fake keeps the callback so a test can fire
// it the way a browser does when a bar wraps to a second line.
const h = vi.hoisted(() => ({
  height: 0,
  callbacks: [] as Array<() => void>,
  disconnected: 0,
}));

class FakeResizeObserver {
  constructor(private readonly callback: () => void) {}
  observe() {
    h.callbacks.push(this.callback);
  }
  disconnect() {
    h.disconnected += 1;
  }
  unobserve() {}
}

const realResizeObserver = window.ResizeObserver;
const heightSpy: { restore?: () => void } = {};

beforeEach(() => {
  h.height = 0;
  h.callbacks = [];
  h.disconnected = 0;
  window.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
  const spy = vi
    .spyOn(HTMLElement.prototype, "offsetHeight", "get")
    .mockImplementation(() => h.height);
  heightSpy.restore = () => spy.mockRestore();
  document.documentElement.style.removeProperty("--test-height");
});

afterEach(() => {
  cleanup();
  heightSpy.restore?.();
  window.ResizeObserver = realResizeObserver;
});

function Bar({ active = true }: { active?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useHeightVariable(ref, "--test-height", active);
  return <div ref={ref}>bar</div>;
}

const published = () => document.documentElement.style.getPropertyValue("--test-height");

describe("useHeightVariable", () => {
  it("publishes the element's height on <html> as soon as it mounts", () => {
    h.height = 71;
    render(<Bar />);
    expect(published()).toBe("71px");
  });

  it("follows the element when it changes size", () => {
    h.height = 55;
    render(<Bar />);
    h.height = 71;
    h.callbacks.forEach((callback) => callback());
    expect(published()).toBe("71px");
  });

  it("removes the variable and stops observing when the element goes", () => {
    h.height = 71;
    const { unmount } = render(<Bar />);
    unmount();
    expect(published()).toBe("");
    expect(h.disconnected).toBe(1);
  });

  it("publishes nothing while inactive", () => {
    h.height = 71;
    const { rerender } = render(<Bar />);
    rerender(<Bar active={false} />);
    expect(published()).toBe("");
  });

  it("still publishes the height once in a browser without ResizeObserver", () => {
    h.height = 55;
    (window as { ResizeObserver?: unknown }).ResizeObserver = undefined;
    render(<Bar />);
    expect(published()).toBe("55px");
  });
});
