import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { collectGuardSites, suiteFor } from "../scripts/guard-mutation";

/**
 * Which side effects a guarded module can actually cause (#645).
 *
 * The boundary suites prove a refused caller causes no side effect by spying on
 * a `writes` object and walking it. That LOOKS exhaustive and is a fixed list.
 * An action that reaches for something not on it (a Stripe cancellation, an
 * email helper added last week) is simply unwatched: a refused caller could
 * trigger it and the suite stays green, because nothing is looking.
 *
 * So the list stops being hand-maintained. These helpers read what the guarded
 * modules actually import, and the suites assert that every one of those is
 * registered. Add an email to an action and forget to spy on it, and the
 * boundary suite fails and tells you which one.
 */

/**
 * Modules whose exports DO something to the outside world.
 *
 * `/config` is excluded: it hands back a price id or a plan, which changes
 * nothing. Requiring a spy on it would teach people that the list is noise, and
 * a list people ignore is the same as no list.
 */
const SIDE_EFFECTING = /^@\/lib\/(email|stripe|storage|slack)\/(?!config$)/;

/** Names imported from a side-effecting module, which is what can be spied on. */
export function sideEffectImports(source: string): string[] {
  const names: string[] = [];
  const re = /import\s*\{([^}]*)\}\s*from\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(source)) !== null) {
    if (!SIDE_EFFECTING.test(m[2])) continue;
    for (const raw of m[1].split(",")) {
      const name = raw.trim();
      if (!name) continue;
      // `type Foo` imports a type: it cannot be called, so it cannot do anything.
      if (name.startsWith("type ")) continue;
      // `foo as bar`: the local name is what the module calls.
      names.push((name.split(/\s+as\s+/).pop() ?? name).trim());
    }
  }

  // A constant is not a side effect. Only a callable can be, and by convention
  // in this codebase every side-effecting export is a lowerCamelCase function
  // while the constants are SHOUTING_CASE.
  return [...new Set(names)].filter((n) => /^[a-z]/.test(n));
}

/** Every server action module: the "use server" directive is what makes it one. */
export function serverActionFiles(root = "src/lib"): string[] {
  const out: string[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (
        entry.name.endsWith(".ts") &&
        !entry.name.endsWith(".test.ts")
      ) {
        const src = readFileSync(full, "utf8");
        if (/^\s*["']use server["']/m.test(src)) out.push(full);
      }
    }
  };

  walk(root);
  return out;
}

/**
 * The side effects a suite must be watching, and is not.
 *
 * Which modules a suite owns is not re-decided here: it is read from the
 * mutation gate's own routing (`suiteFor`), so the suite that is REQUIRED to
 * catch a missing guard is the same suite required to watch what that module can
 * do. Two lists that could drift are one list.
 *
 * A module with no guard at all belongs to no suite and is skipped. The contact
 * form and the newsletter signup are public on purpose: they refuse nobody, so
 * there is no boundary for them to hold.
 */
export function unwatchedSideEffects(
  suite: string,
  watched: string[],
): { file: string; missing: string[] }[] {
  const known = new Set(watched);
  const gaps: { file: string; missing: string[] }[] = [];

  for (const file of serverActionFiles()) {
    const source = readFileSync(file, "utf8");
    const suites = new Set(
      collectGuardSites(file, source).map((site) => suiteFor(file, site.guard)),
    );
    if (!suites.has(suite)) continue;

    const missing = sideEffectImports(source).filter((n) => !known.has(n));
    if (missing.length > 0) gaps.push({ file, missing });
  }

  return gaps;
}
