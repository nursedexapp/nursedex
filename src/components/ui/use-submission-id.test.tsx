// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSubmissionId } from "./use-submission-id";

/**
 * #708/#696. The server used to invent the identity of a new row, so a request
 * that ran twice invented two identities and the user got two contact messages,
 * two comments, or two blog posts. The client mints the identity instead, once,
 * and a retry carries the SAME one so the database can recognise it as the same
 * submission.
 *
 * Everything here turns on two rules. A retry must reuse the id (or the retry is
 * just a second submission wearing a hat), and a success must roll it over (or
 * the user's next genuine message is silently swallowed as a duplicate).
 */
let counter = 0;

beforeEach(() => {
  counter = 0;
  vi.stubGlobal("crypto", {
    randomUUID: () => `id-${++counter}`,
  });
});

describe("useSubmissionId", () => {
  it("hands back the same id every time it is read", () => {
    const { result } = renderHook(() => useSubmissionId());

    const first = result.current.currentSubmissionId();
    const second = result.current.currentSubmissionId();

    expect(first).toBe("id-1");
    expect(second).toBe("id-1");
  });

  it("keeps the id stable across re-renders, so a retry is the same submission", () => {
    const { result, rerender } = renderHook(() => useSubmissionId());

    const before = result.current.currentSubmissionId();
    rerender();
    const after = result.current.currentSubmissionId();

    expect(after).toBe(before);
  });

  it("mints a NEW id after a renew, so the next genuine submission is genuinely new", () => {
    // Without this, the second message a user sends carries the first message's
    // id and the database throws it away as a duplicate.
    const { result } = renderHook(() => useSubmissionId());

    const first = result.current.currentSubmissionId();
    act(() => result.current.renewSubmissionId());
    const second = result.current.currentSubmissionId();

    expect(first).toBe("id-1");
    expect(second).toBe("id-2");
  });

  it("does not mint anything until it is actually read", () => {
    // The id is only needed at submit time. Minting in a state initialiser would
    // also run during server rendering, where it means nothing.
    renderHook(() => useSubmissionId());

    expect(counter).toBe(0);
  });
});
