import { describe, it, expect } from "vitest";
import { Linter } from "eslint";
import tseslint from "typescript-eslint";
import rule from "./require-db-error-check.mjs";

const linter = new Linter();

function lint(code) {
  return linter.verify(
    code,
    {
      files: ["**/*.ts"],
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: { ecmaVersion: "latest", sourceType: "module" },
      },
      plugins: { local: { rules: { "require-db-error-check": rule } } },
      rules: { "local/require-db-error-check": "error" },
    },
    "thing.ts",
  );
}

function expectFlagged(code, count = 1) {
  const messages = lint(code);
  expect(messages.map((m) => m.message).join("\n")).not.toMatch(
    /parsing error/i,
  );
  expect(messages.map((m) => m.ruleId)).toEqual(
    Array(count).fill("local/require-db-error-check"),
  );
  return messages;
}

function expectClean(code) {
  const messages = lint(code);
  expect(messages.map((m) => m.message).join("\n")).not.toMatch(
    /parsing error/i,
  );
  expect(messages).toEqual([]);
}

const fn = (body) => `async function f(supabase, id) {\n${body}\n}`;

describe("the shape the sweep exists to remove", () => {
  it("flags a destructure that omits error", () => {
    const [m] = expectFlagged(
      fn(`const { data } = await supabase.from("t").select("x").eq("id", id);
          return data;`),
    );
    expect(m.message).toMatch(/discard/i);
  });

  it("flags a bare awaited write whose result is thrown away", () => {
    expectFlagged(fn(`await supabase.from("t").delete().eq("id", id);`));
  });

  it("flags reading .data straight off the awaited result", () => {
    expectFlagged(
      fn(`return (await supabase.from("t").select("x")).data;`),
    );
  });

  it("flags a result held in a variable whose error is never read", () => {
    expectFlagged(
      fn(`const res = await supabase.from("t").select("x");
          return res.data ?? [];`),
    );
  });

  it("flags a discarded .rpc call", () => {
    expectFlagged(fn(`await supabase.rpc("increment_views", { id });`));
  });

  it("flags a discarded storage removal", () => {
    expectFlagged(
      fn(`await supabase.storage.from("photos").remove(["a.jpg"]);`),
    );
  });

  it("follows a query assigned once and awaited later, with no reassignment", () => {
    // The other half of the builder pattern: nothing reassigns `query`, so the
    // base-name test above cannot see it and the declaration itself has to.
    expectFlagged(
      fn(`const query = supabase.from("t").select("slug").like("slug", "a%");
          const { data } = await query;
          return data;`),
    );
  });

  it("follows a query built up across statements", () => {
    expectFlagged(
      fn(`let q = supabase.from("t").select("x");
          if (id) q = q.eq("id", id);
          const { data } = await q;
          return data;`),
    );
  });
});

describe("the shapes no destructuring pattern could see (#991)", () => {
  it("flags each unchecked element of a Promise.all", () => {
    expectFlagged(
      fn(`const [nurses, hires] = await Promise.all([
            supabase.from("nurse_profiles").select("*", { count: "exact", head: true }),
            supabase.from("hires").select("*", { count: "exact", head: true }),
          ]);
          return (nurses.count ?? 0) + (hires.count ?? 0);`),
      2,
    );
  });

  it("flags only the unchecked element when its neighbour is checked", () => {
    expectFlagged(
      fn(`const [a, b] = await Promise.all([
            supabase.from("a").select("x"),
            supabase.from("b").select("y"),
          ]);
          if (a.error) throw new Error(a.error.message);
          return b.data;`),
      1,
    );
  });
});

describe("what it must not flag, so nobody is pressured into a disable", () => {
  it("accepts a hand written destructure that binds error", () => {
    expectClean(
      fn(`const { data, error } = await supabase.from("t").select("x");
          if (error) throw new Error(error.message);
          return data;`),
    );
  });

  it("accepts a rest element, which captures error", () => {
    expectClean(
      fn(`const { data, ...rest } = await supabase.from("t").select("x");
          if (rest.error) throw new Error("no");
          return data;`),
    );
  });

  it("accepts a count query wrapped in the count helper", () => {
    expectClean(
      fn(`return await unwrapCountOrThrow(
            supabase.from("t").select("*", { count: "exact", head: true }),
            "the rows",
          );`),
    );
  });

  it("accepts a query wrapped in a helper", () => {
    expectClean(
      fn(`return await unwrapOrThrow(supabase.from("t").select("x"), "the rows");`),
    );
  });

  it("accepts an awaited result handed to a helper", () => {
    expectClean(
      fn(`await assertNoWriteError(await supabase.from("t").insert({}), "the row");`),
    );
  });

  it("accepts Promise.all elements that are each wrapped in a helper", () => {
    expectClean(
      fn(`const [a, b] = await Promise.all([
            unwrapOrThrow(supabase.from("a").select("x"), "a"),
            unwrapOrThrow(supabase.from("b").select("y"), "b"),
          ]);
          return [a, b];`),
    );
  });

  it("accepts a variable whose error is read later", () => {
    expectClean(
      fn(`const res = await supabase.from("t").select("x");
          if (res.error) throw new Error(res.error.message);
          return res.data;`),
    );
  });

  it("accepts a variable later destructured for error", () => {
    expectClean(
      fn(`const res = await supabase.from("t").select("x");
          const { error } = res;
          if (error) throw new Error(error.message);
          return res.data;`),
    );
  });

  it("accepts a result returned whole, because the caller gets the error", () => {
    expectClean(fn(`return await supabase.from("t").select("x");`));
  });

  it("accepts a variable passed to a helper", () => {
    expectClean(
      fn(`const res = await supabase.from("t").insert({});
          await assertNoWriteError(res, "the row");`),
    );
  });

  it("does not mistake an awaited Array.from chain for a database read", () => {
    // The chain carries a `.from(...)`, which is why the rule requires a query
    // verb as well. Without that, Array.from and Buffer.from read as reads.
    expectClean(
      fn(`const { length } = await Array.from([id]).reduce(
            async (acc) => acc,
            Promise.resolve([]),
          );
          return length;`),
    );
  });

  it("does not flag an awaited value that is not a database result", () => {
    expectClean(fn(`const { data } = await fetchJson("/api/x");`));
  });

  it("does not flag an awaited promise that only looks like a builder", () => {
    // The chain bottoms out in an identifier, the same as `q = q.eq(...)`
    // does, so the builder test has to check that the base is the variable
    // ITSELF. Copied from the page that this rule flagged without it, which
    // touches no database at all.
    expectClean(`
      export default async function NursesPage() {
        const facetsPromise = getDirectoryFacets().catch((error: unknown) => {
          console.error("[nurses] directory facet read failed:", error);
          return null;
        });

        const [a] = await Promise.all([Promise.resolve(1)]);
        const facets = await facetsPromise;
        return [a, facets];
      }
    `);
  });

  it("does not flag a query builder that is never awaited here", () => {
    expectClean(
      `export function build(supabase) {
         return supabase.from("t").select("x");
       }`,
    );
  });
});

describe("results that are never awaited at all", () => {
  it("flags a fire and forget write", () => {
    expectFlagged(
      fn(`void supabase.from("page_views").insert({ id });
          return true;`),
    );
  });

  it("flags a bare voided rpc call", () => {
    expectFlagged(fn(`void supabase.rpc("increment_views", { id });`));
  });

  it("does not flag a mock recording calls into a spy named rpc", () => {
    // `.rpc(...)` alone is not distinctive enough to stand without a `void` or
    // an `await`: this is a test double, not a database call, and it was
    // flagged before the rule asked for one.
    expectClean(`
      function client(writes) {
        return {
          rpc: (...a) => {
            writes.rpc(...a);
            return Promise.resolve({ data: null, error: null });
          },
        };
      }
    `);
  });
});

describe("a raw result handed to something that is not a helper", () => {
  it("is flagged, because that callee reads data and never sees error", () => {
    expectFlagged(
      fn(`return summarise(await supabase.from("t").select("x"));`),
    );
  });
});

// #992. The rule is at `error` over a tree with zero instances, and a count
// driven to zero stops being read as a measurement: it starts being read as
// proof the class cannot occur, and nobody re-examines it (L182). A rule that
// quietly stopped matching a shape would look exactly the same.
//
// So the shapes are enumerated and counted here. Each one is a real shape found
// in this repo during the milestone 35 sweep, with the file it came from named,
// and the recorded total means a shape cannot be dropped from the rule without
// this failing.
const SHAPES = [
  {
    name: "a destructure that omits error",
    from: "src/lib/subscriptions/queries.ts, the #845 defect",
    code: `const { data } = await supabase.from("t").select("x"); return data;`,
  },
  {
    name: "a bare awaited write",
    from: "src/lib/admin/account-actions.ts, the unwritten ban in #982",
    code: `await supabase.from("t").delete().eq("id", id);`,
  },
  {
    name: "data read straight off the awaited result",
    from: "src/lib/hires/queries.ts",
    code: `return (await supabase.from("t").select("x")).data;`,
  },
  {
    name: "a result held in a variable whose error is never read",
    from: "src/lib/blog/queries.ts, the paged archives",
    code: `const res = await supabase.from("t").select("x"); return res.data ?? [];`,
  },
  {
    name: "a query built up across statements",
    from: "src/lib/admin/queries.ts, the account search",
    code: `let q = supabase.from("t").select("x");
           if (id) q = q.eq("id", id);
           const { data } = await q;
           return data;`,
  },
  {
    name: "a query assigned once and awaited later",
    from: "src/lib/blog/slug.ts",
    code: `const query = supabase.from("t").select("slug").like("slug", "a%");
           const { data } = await query;
           return data;`,
  },
  {
    name: "a fire and forget write",
    from: "src/lib/nurses/search-gap.ts",
    code: `void supabase.from("page_views").insert({ id }); return true;`,
  },
  {
    name: "a voided rpc call",
    from: 'src/app/(public)/nurses/[slug]/page.tsx, now an exemption',
    code: `void supabase.rpc("increment_views", { id });`,
  },
  {
    name: "a storage removal",
    from: "src/lib/profile/photos.ts",
    code: `await supabase.storage.from("photos").remove(["a.jpg"]);`,
  },
  {
    name: "an unchecked element of a Promise.all",
    from: "src/lib/admin/analytics.ts, the sixteen dashboard counts",
    code: `const [a] = await Promise.all([
             supabase.from("a").select("*", { count: "exact", head: true }),
           ]);
           return a.count ?? 0;`,
  },
  {
    name: "a raw result handed to something that is not a helper",
    from: "the shape that would carry a result past every check",
    code: `return summarise(await supabase.from("t").select("x"));`,
  },
];

// Bump this deliberately, in the same commit that adds the shape.
const SHAPES_COVERED = 11;

describe("the shapes this rule is accountable for", () => {
  it("still catches every one of them", () => {
    const missed = SHAPES.filter(
      (shape) =>
        !lint(fn(shape.code)).some(
          (m) => m.ruleId === "local/require-db-error-check",
        ),
    ).map((shape) => `${shape.name} (${shape.from})`);

    expect(missed).toEqual([]);
  });

  it("names as many shapes as it is recorded as covering", () => {
    // A shape deleted from the list would leave the assertion above passing
    // over a smaller set, which is the zero problem one level up.
    expect(SHAPES).toHaveLength(SHAPES_COVERED);
  });
});
