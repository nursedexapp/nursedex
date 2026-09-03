import { existsSync, readdirSync, statSync } from "node:fs";
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
 * It refuses rather than returning nothing, and the two ways of getting
 * nothing say different things. A scan of a path that has moved otherwise
 * reports no violations, which is indistinguishable from a clean tree and
 * makes every guard built on it pass while blind.
 *
 * There is deliberately no try/catch around the walk. A subdirectory that
 * cannot be read is a part of the tree that went unchecked, and swallowing it
 * leaves the total non-empty, so nothing downstream could tell. Let it throw,
 * naming the path it failed on.
 *
 * A refusal is never memoised, so a fixed path works on the next call rather
 * than staying broken for the rest of the run.
 */
export function sourceFilesUnder(dir: string): string[] {
  const hit = cache.get(dir);
  if (hit) return hit;

  if (!existsSync(dir)) {
    throw new Error(
      `sourceFilesUnder("${dir}"): that path does not exist. A guard reading it would find no violations and pass while blind.`,
    );
  }

  const out: string[] = [];
  collect(dir, out);
  if (out.length === 0) {
    throw new Error(
      `sourceFilesUnder("${dir}"): the path exists but found no files in it. A guard reading it would pass while blind.`,
    );
  }
  cache.set(dir, out);
  return out;
}

function collect(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collect(full, out);
    } else {
      out.push(full);
    }
  }
}
