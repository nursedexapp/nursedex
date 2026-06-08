import type { TiptapDoc } from "@/types/database";

// How long an editor draft stored for preview is considered fresh. Past
// this, the preview falls back to the saved content rather than showing a
// stale draft from an earlier session.
export const PREVIEW_TTL_MS = 5 * 60 * 1000;

export interface PreviewDraft {
  title: string;
  excerpt: string | null;
  content: TiptapDoc;
  cover_image_url: string | null;
  ts: number;
}

function previewKey(id: string): string {
  return `blog-preview-${id}`;
}

/**
 * Persist the current editor body so a preview tab (same origin, so it
 * shares localStorage) can render unsaved edits without writing to the DB.
 */
export function writePreviewDraft(
  id: string,
  draft: Omit<PreviewDraft, "ts">,
): void {
  try {
    localStorage.setItem(
      previewKey(id),
      JSON.stringify({ ...draft, ts: Date.now() }),
    );
  } catch {
    // localStorage unavailable; the preview just shows saved content.
  }
}

/** Read a recent editor draft for the preview, or null if missing/stale. */
export function readPreviewDraft(id: string): PreviewDraft | null {
  try {
    const raw = localStorage.getItem(previewKey(id));
    if (!raw) return null;
    const draft = JSON.parse(raw) as PreviewDraft;
    if (!draft || typeof draft.ts !== "number") return null;
    if (Date.now() - draft.ts > PREVIEW_TTL_MS) return null;
    return draft;
  } catch {
    return null;
  }
}
