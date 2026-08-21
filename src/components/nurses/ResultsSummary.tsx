import type { SearchResult } from "@/lib/nurses/search";
import { resultsSummary } from "./results-summary-copy";

/**
 * What the page says it is showing.
 *
 * Both numbers come from one predicate: full matches. The grid also renders
 * partials, which match some filters but not all, so counting them into either
 * number would let the bar read "Showing 12 of 3". They are counted and
 * described separately instead, under their own heading (#777).
 *
 * There is deliberately no "Most complete profiles first" caption. The real
 * order is featured, then has a photo, then a match on how the family prefers
 * to be contacted, then review count, then rating, and only then completeness.
 * Printing the mockup's caption would state something the code does not do.
 */
export function ResultsSummary({ result }: { result: SearchResult }) {
  const { headline, order, partials } = resultsSummary(result);

  return (
    <div className="text-soft-black-light text-sm">
      <p>{headline}</p>
      {order ? <p className="mt-0.5">{order}</p> : null}
      {partials ? <p className="mt-0.5">{partials}</p> : null}
    </div>
  );
}
