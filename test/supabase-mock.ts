// Shared chainable Supabase query-builder mock. Every action/cron test that
// mocks a Supabase table hand-rolled a near-identical builder (select/eq/
// maybeSingle/insert/update). Each test keeps its own hoisted state and
// call-recording arrays; this factory only wires the repeated chain
// plumbing so every builder's terminal/thenable methods behave consistently
// (see the thenable-not-promise memory note this is meant to guard against).

type Resolved = { data?: unknown; error?: unknown; count?: number | null };
type Handler = (...args: unknown[]) => Resolved | "chain";

const METHODS = [
  "select",
  "eq",
  "neq",
  "not",
  "in",
  "is",
  "gte",
  "lte",
  "gt",
  "lt",
  "or",
  "order",
  "limit",
  // Paged reads. A caller that pages rather than reading unbounded is doing
  // the right thing (PostgREST caps a select and returns a healthy looking
  // prefix), so the shared builder has to be able to stand in for it.
  "range",
  "maybeSingle",
  "single",
  "insert",
  "update",
  "upsert",
  "delete",
] as const;

export interface QueryBuilderHandlers {
  [method: string]: Handler | undefined;
}

export interface QueryBuilder {
  [method: string]: (...args: unknown[]) => QueryBuilder;
}

/**
 * Any method left unconfigured keeps chaining (returns the builder itself),
 * matching a Supabase filter call like `.eq()` or `.order()`. A configured
 * handler either resolves the query (returns a Resolved value, wrapped in a
 * Promise) or keeps chaining by returning the "chain" sentinel, matching
 * Supabase methods that are sometimes terminal and sometimes not (e.g.
 * `.update()` before a following `.eq()`).
 */
/** One range filter the code under test applied, e.g. `.gte("verified_at", iso)`. */
export interface RangeFilter {
  method: string;
  column: string;
  value: unknown;
}

const RANGE_METHODS = ["gte", "lte", "gt", "lt"] as const;

/**
 * Records the range filters a query applies, so a test can assert the date
 * window a cron computed rather than only the rows it was handed back (#622).
 * Stubbing the result alone leaves an off-by-one on a boundary invisible.
 *
 * Spread `handlers` into createQueryBuilder, then read `calls`, or use
 * `bound(method, column)` for a single boundary.
 */
export function createRangeFilterRecorder() {
  const calls: RangeFilter[] = [];

  const handlers: QueryBuilderHandlers = {};
  for (const method of RANGE_METHODS) {
    handlers[method] = (...args: unknown[]) => {
      calls.push({ method, column: String(args[0]), value: args[1] });
      return "chain";
    };
  }

  /** The value passed to e.g. `.gte("verified_at", ...)`, or undefined. */
  function bound(method: string, column: string): unknown {
    return calls.find((c) => c.method === method && c.column === column)?.value;
  }

  function reset() {
    calls.length = 0;
  }

  return { calls, handlers, bound, reset };
}

export function createQueryBuilder(
  handlers: QueryBuilderHandlers = {},
): QueryBuilder {
  const builder = {} as QueryBuilder;

  for (const name of METHODS) {
    builder[name] = (...args: unknown[]) => {
      const handler = handlers[name];
      if (!handler) return builder;
      const result = handler(...args);
      // Terminal calls (e.g. .maybeSingle()) are awaited by the caller, not
      // chained, so the runtime value is a Promise<Resolved> even though the
      // static type below claims QueryBuilder for uniform chaining.
      return (result === "chain"
        ? builder
        : Promise.resolve(result)) as unknown as QueryBuilder;
    };
  }

  if (handlers.then) {
    const thenHandler = handlers.then;
    (builder as unknown as { then: PromiseLike<Resolved>["then"] }).then = (
      resolve,
    ) => Promise.resolve(thenHandler()).then(resolve as never);
  }

  return builder;
}
