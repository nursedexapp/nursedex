"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

export const COMMIT_DELAY_MS = 400;

/**
 * A filter input that commits after a pause rather than on every keystroke.
 *
 * Free text filters cannot be controlled directly by the URL state: every
 * keystroke would start a router transition, and the re-render that follows
 * would reset the input to the stale URL value, eating fast keystrokes (the
 * second digit of "15 years"). The typed text lives in local state and is
 * committed after a short pause.
 *
 * On unmount the pending commit is FLUSHED, not dropped. Inside a popover,
 * closing it (including with Escape, which the chip has to support) would
 * otherwise throw away what was typed with no sign it happened (#775).
 */
export function DebouncedFilterInput({
  value,
  onCommit,
  sanitize,
  renderHint,
  ...inputProps
}: {
  value: string;
  onCommit: (raw: string) => void;
  sanitize?: (raw: string) => string;
  renderHint?: (text: string) => React.ReactNode;
} & Omit<React.ComponentProps<typeof Input>, "value" | "onChange">) {
  const [text, setText] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const commitPendingRef = useRef(false);
  const pendingValueRef = useRef(value);
  const lastValueRef = useRef(value);
  const onCommitRef = useRef(onCommit);

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  // Adopt external URL changes (clear all, back/forward navigation) unless
  // the user has an uncommitted edit in flight.
  useEffect(() => {
    if (value !== lastValueRef.current) {
      lastValueRef.current = value;
      if (!commitPendingRef.current) setText(value);
    }
  }, [value]);

  // Flush rather than clear. A dropped edit is invisible: the popover closes,
  // the results do not change, and nothing says why.
  useEffect(
    () => () => {
      clearTimeout(timerRef.current);
      if (commitPendingRef.current) {
        commitPendingRef.current = false;
        onCommitRef.current(pendingValueRef.current);
      }
    },
    [],
  );

  const hint = renderHint?.(text);
  const hintId = inputProps.id ? `${inputProps.id}-hint` : undefined;

  return (
    <>
      <Input
        {...inputProps}
        aria-describedby={
          hint && hintId ? hintId : inputProps["aria-describedby"]
        }
        value={text}
        onChange={(e) => {
          const raw = sanitize ? sanitize(e.target.value) : e.target.value;
          setText(raw);
          commitPendingRef.current = true;
          pendingValueRef.current = raw;
          clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => {
            commitPendingRef.current = false;
            onCommitRef.current(raw);
          }, COMMIT_DELAY_MS);
        }}
      />
      {renderHint ? (
        <p
          id={hintId}
          role="status"
          aria-live="polite"
          className="text-soft-black-light mt-1 min-h-4 text-xs"
        >
          {hint}
        </p>
      ) : null}
    </>
  );
}

/** Parse a filter number, treating anything unreadable as "not set". */
export function parseFilterInt(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}
