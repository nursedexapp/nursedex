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
  "in",
  "is",
  "gte",
  "lte",
  "gt",
  "lt",
  "or",
  "order",
  "limit",
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
      return (
        result === "chain" ? builder : Promise.resolve(result)
      ) as unknown as QueryBuilder;
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
