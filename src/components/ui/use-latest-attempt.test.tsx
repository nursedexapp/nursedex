// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useLatestAttempt } from "./use-latest-attempt";

// #669. A retry does NOT cancel the first request. The hung one is still out
// there and can land afterwards, contradicting the retry: a superseded upload
// adds the photo twice, a superseded delete toasts a failure over work the retry
// already did. So a retry-mode surface needs to know which attempt it is looking
// at, and let only the newest one speak.
//
// Lifted out of PhotoUpload, which is the only place that had worked this out.

describe("useLatestAttempt", () => {
  it("treats the only attempt as the latest", () => {
    const { result } = renderHook(() => useLatestAttempt());

    let first = 0;
    act(() => {
      first = result.current.begin();
    });

    expect(result.current.isLatest(first)).toBe(true);
  });

  it("disowns an earlier attempt once a later one begins", () => {
    const { result } = renderHook(() => useLatestAttempt());

    let first = 0;
    let second = 0;
    act(() => {
      first = result.current.begin();
      second = result.current.begin();
    });

    // The hung first request lands late. It must not be allowed to report.
    expect(result.current.isLatest(first)).toBe(false);
    expect(result.current.isLatest(second)).toBe(true);
  });

  it("keeps counting across many retries, never reusing a stale number", () => {
    const { result } = renderHook(() => useLatestAttempt());

    const attempts: number[] = [];
    act(() => {
      for (let i = 0; i < 5; i++) attempts.push(result.current.begin());
    });

    expect(new Set(attempts).size).toBe(5);
    expect(attempts.slice(0, 4).every((a) => !result.current.isLatest(a))).toBe(
      true,
    );
    expect(result.current.isLatest(attempts[4])).toBe(true);
  });
});
