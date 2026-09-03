import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const sep = join("a", "b").slice(1, -1);

/** Path with platform separators normalised to "/" for comparison. */
export function normalise(path: string): string {
  return path.split(sep).join("/");
}

const cache = new Map<string, string[]>();

/**
 * Every file under `dir`, recursively. Callers filter by extension.
 *
 * Shared rather than copied: three guard tests walk the tree to enumerate
 * their own subjects, and a guard that enumerates by hand goes blind to
 * whatever is added after it was written.
 *
 * Refuses an empty result instead of returning one. A scan of a path that
 * does not exist, or that has been moved, otherwise reports no violations,
 * which is indistinguishable from a clean tree and makes every guard built on
 * it silently pass. The refusal is never memoised, so a fixed path works on
 * the next call rather than staying broken for the rest of the run.
 */
export function sourceFilesUnder(dir: string): string[] {
  const hit = cache.get(dir);
  if (hit) return hit;

  const out: string[] = [];
  collect(dir, out);
  if (out.length === 0) {
    throw new Error(
      `sourceFilesUnder("${dir}") found no files. The path is wrong or the tree moved; a guard reading it would pass while blind.`,
    );
  }
  cache.set(dir, out);
  return out;
}

function collect(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collect(full, out);
    } else {
      out.push(full);
    }
  }
}
