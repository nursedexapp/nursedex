"use client";

import { useCallback, useRef } from "react";

/**
 * A stable identity for one logical submission, minted on the client.
 *
 * The bug this exists for (#708, #696): the client asked the server to "create
 * something" and the server invented the identity. Run the request twice and the
 * server invents two identities, so the user gets two contact messages, two
 * comments, or two blog posts. Nothing in the database could tell the second
 * write apart from a genuine new one, because as far as it knew, it was one.
 *
 * Minting the identity on the client inverts that. A retry carries the SAME id,
 * so the insert collides with the row it already wrote and the database throws
 * the duplicate away. It is the same principle as the #663 sweep: make the write
 * itself the gate, rather than checking beforehand whether to write.
 *
 * Two rules, and both matter:
 *
 *   A retry must REUSE the id. Renew on failure and the retry is just a second
 *   submission wearing a hat, which is the bug all over again.
 *
 *   A success must RENEW the id. Keep it and the user's next genuine message
 *   carries the previous message's id, and gets silently swallowed as a
 *   duplicate. That failure is worse than the one we set out to fix, because it
 *   is invisible: the form says it sent.
 *
 * The id is minted lazily, on first read, rather than in a state initialiser.
 * It is only needed at submit time, which is client-only, and a state
 * initialiser would also run during server rendering where the value means
 * nothing and is thrown away.
 */
export function useSubmissionId() {
  const id = useRef<string | null>(null);

  /** The id for the submission in flight. Stable until it is renewed. */
  const currentSubmissionId = useCallback(
    () => (id.current ??= crypto.randomUUID()),
    [],
  );

  /** Call ONLY after a submission has definitively landed. */
  const renewSubmissionId = useCallback(() => {
    id.current = null;
  }, []);

  return { currentSubmissionId, renewSubmissionId };
}
