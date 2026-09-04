/**
 * Remove the disposable build caches (#750).
 *
 * Measured on this machine 2026-08-21 and again 2026-09-03: the working copy
 * was 3.5 GB, of which `.next/dev` alone was 2.4 GB, and it had grown to 3.0 GB
 * two weeks later. Inside it, `.next/dev/cache/turbopack` held 163 SST files,
 * 93 of them written in July and still there in September. Nothing compacts or
 * evicts them.
 *
 * There is no configuration that would: this Next version exposes
 * `turbopackFileSystemCacheForDev` (a boolean, default true) and
 * `turbopackMemoryLimit` (memory, not disk), and nothing that caps the cache on
 * disk or prunes it by age. Switching the cache off would trade the disk for
 * every cold start, which is the wrong trade. So the remedy is a known command
 * rather than a setting, which is what this is.
 *
 * Everything it removes is gitignored and rebuilds itself. The cost of running
 * it is one slower dev start.
 *
 * Usage:
 *   npm run clean          remove them
 *   npm run clean -- -n    say what would go, remove nothing
 */
import { existsSync, rmSync, statSync, readdirSync } from "node:fs";
import { join, resolve, relative, isAbsolute } from "node:path";

/** The caches this removes, in the order they are reported. */
export const CLEAN_TARGETS = [
  // The dev server's Turbopack cache and the production build output.
  ".next",
  // ESLint's cache. Small, but it is the other thing that goes stale.
  "node_modules/.cache/eslint",
  // Vitest's slowest-first ordering store. Deliberately outside node_modules
  // (see vitest.config.ts) so it survives npm ci; a clean run rebuilds it.
  ".vitest-cache",
];

export interface CleanTarget {
  target: string;
  present: boolean;
  bytes: number;
}

export interface CleanResult {
  removed: CleanTarget[];
  absent: CleanTarget[];
  freedBytes: number;
  dryRun: boolean;
}

function directorySize(path: string): number {
  let total = 0;
  const stack = [path];

  while (stack.length) {
    const current = stack.pop()!;
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      // A directory that vanished mid-walk contributes nothing. It cannot be
      // silently treated as an error either: the caller is about to delete it.
      continue;
    }
    for (const entry of entries) {
      const child = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(child);
      } else {
        try {
          total += statSync(child).size;
        } catch {
          continue;
        }
      }
    }
  }

  return total;
}

/**
 * Resolve a target against the root and refuse anything that escapes it. This
 * runs with a person's own shell in their own checkout, so a target naming a
 * parent directory or an absolute path is a mistake worth stopping rather than
 * a configuration to honour.
 */
function resolveTarget(root: string, target: string): string {
  const resolved = resolve(root, target);
  const inside = relative(resolve(root), resolved);

  if (!inside || inside.startsWith("..") || isAbsolute(inside)) {
    throw new Error(
      `clean: refusing "${target}", which resolves outside the project root`,
    );
  }

  return resolved;
}

/** Measure each target without touching it. */
export function planClean(
  root: string,
  targets: string[] = CLEAN_TARGETS,
): CleanTarget[] {
  return targets.map((target) => {
    const path = resolveTarget(root, target);
    if (!existsSync(path)) {
      return { target, present: false, bytes: 0 };
    }
    return { target, present: true, bytes: directorySize(path) };
  });
}

export function runClean(
  root: string,
  targets: string[] = CLEAN_TARGETS,
  options: { dryRun: boolean } = { dryRun: false },
): CleanResult {
  const plan = planClean(root, targets);
  const removed = plan.filter((t) => t.present);
  const absent = plan.filter((t) => !t.present);

  if (!options.dryRun) {
    for (const target of removed) {
      rmSync(resolveTarget(root, target.target), {
        recursive: true,
        force: true,
      });
    }
  }

  return {
    removed,
    absent,
    freedBytes: removed.reduce((sum, t) => sum + t.bytes, 0),
    dryRun: options.dryRun,
  };
}

function humanBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

/**
 * A report that distinguishes "there was nothing to remove" from "everything
 * was removed". Exiting quietly makes those the same event, and then a clean
 * that silently did nothing reads as one that worked.
 */
export function formatCleanReport(result: CleanResult): string {
  const lines: string[] = [];
  const prefix = result.dryRun ? "clean (dry run)" : "clean";

  if (!result.removed.length) {
    lines.push(`${prefix}: nothing to remove.`);
    for (const target of result.absent) {
      lines.push(`  ${target.target} is not there`);
    }
    return lines.join("\n");
  }

  const verb = result.dryRun ? "would remove" : "removed";
  for (const target of result.removed) {
    lines.push(`  ${verb} ${target.target} (${humanBytes(target.bytes)})`);
  }
  for (const target of result.absent) {
    lines.push(`  ${target.target} is not there`);
  }

  const freed = result.dryRun ? "would free" : "freed";
  lines.push(`${prefix}: ${freed} ${humanBytes(result.freedBytes)}.`);

  return lines.join("\n");
}

// Entry point. Guarded so importing this from a test runs nothing.
if (process.argv[1] && process.argv[1].endsWith("clean.ts")) {
  const dryRun =
    process.argv.includes("-n") || process.argv.includes("--dry-run");
  console.log(formatCleanReport(runClean(process.cwd(), CLEAN_TARGETS, { dryRun })));
}
