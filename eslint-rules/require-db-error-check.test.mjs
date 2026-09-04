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

  it("flags a bare un-awaited rpc call", () => {
    expectFlagged(fn(`supabase.rpc("increment_views", { id });`));
  });
});

describe("a raw result handed to something that is not a helper", () => {
  it("is flagged, because that callee reads data and never sees error", () => {
    expectFlagged(
      fn(`return summarise(await supabase.from("t").select("x"));`),
    );
  });
});
