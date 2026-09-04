import { describe, it, expect } from "vitest";
import { makeBranchLookup } from "./migration-branches";

function fakeGit(refs: string[], trees: Record<string, string[]>) {
  return (args: string[]): string => {
    if (args[0] === "for-each-ref") return refs.join("\n") + "\n";
    if (args[0] === "ls-tree") {
      const branch = args[2];
      return (trees[branch] ?? []).join("\n") + "\n";
    }
    throw new Error(`unexpected git call: ${args.join(" ")}`);
  };
}

describe("makeBranchLookup", () => {
  it("names the branch carrying a migration that is not on main", () => {
    const lookup = makeBranchLookup({
      run: fakeGit(
        ["origin/main", "origin/feat/analytics"],
        {
          "origin/feat/analytics": ["supabase/migrations/068_analytics_opt_out.sql"],
        },
      ),
    });

    expect(lookup("068")).toEqual(["origin/feat/analytics"]);
  });

  it("answers with an empty list when no branch carries it", () => {
    const lookup = makeBranchLookup({
      run: fakeGit(["origin/main", "origin/other"], {
        "origin/other": ["supabase/migrations/001_schema.sql"],
      }),
    });

    expect(lookup("099")).toEqual([]);
  });

  it("does not match a version that is only a prefix of another", () => {
    const lookup = makeBranchLookup({
      run: fakeGit(["origin/main", "origin/other"], {
        "origin/other": ["supabase/migrations/0681_something.sql"],
      }),
    });

    expect(lookup("068")).toEqual([]);
  });

  // Measured against this repository on 2026-09-04: for-each-ref returns the
  // bare remote name alongside the real branches, because
  // refs/remotes/origin/HEAD abbreviates to "origin". It points at main, so it
  // cannot carry an untracked migration, but naming it in the alert would say
  // "still on a branch: 070 (origin)", which is a sentence about nothing.
  it("does not report the bare remote name as a branch", () => {
    const lookup = makeBranchLookup({
      run: fakeGit(["origin", "origin/main", "origin/feat/x"], {
        origin: ["supabase/migrations/070_x.sql"],
        "origin/feat/x": ["supabase/migrations/070_x.sql"],
      }),
    });

    expect(lookup("070")).toEqual(["origin/feat/x"]);
  });

  it("ignores main and HEAD, which are what untracked already means", () => {
    const lookup = makeBranchLookup({
      run: fakeGit(["origin/main", "origin/HEAD"], {
        "origin/main": ["supabase/migrations/068_x.sql"],
      }),
    });

    // Only main and HEAD exist, so there is nothing left to search and the
    // lookup cannot answer.
    expect(lookup("068")).toBeNull();
  });

  // Null and [] must not collapse. An empty list accuses somebody of hand
  // applying SQL; null says nothing was established.
  it("answers null when the refs could not be listed", () => {
    const lookup = makeBranchLookup({
      run: (args) => {
        if (args[0] === "for-each-ref") throw new Error("not a git repository");
        return "";
      },
    });

    expect(lookup("068")).toBeNull();
  });

  it("answers null when no branches were fetched at all", () => {
    const lookup = makeBranchLookup({ run: fakeGit([], {}) });

    expect(lookup("068")).toBeNull();
  });

  it("answers null when one branch cannot be read, rather than a partial answer", () => {
    const lookup = makeBranchLookup({
      run: (args) => {
        if (args[0] === "for-each-ref") return "origin/a\norigin/b\n";
        if (args[2] === "origin/b") throw new Error("bad object");
        return "supabase/migrations/001_schema.sql\n";
      },
    });

    expect(lookup("068")).toBeNull();
  });

  it("refuses a version that is not a migration number", () => {
    const lookup = makeBranchLookup({
      run: () => {
        throw new Error("git should never be called");
      },
    });

    for (const bad of ["", "abc", "../../etc", "06", "068; rm -rf /"]) {
      expect(lookup(bad)).toBeNull();
    }
  });
});
