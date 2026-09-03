/**
 * The styling for a plain <select> on the directory, shared rather than
 * copied: the filter panel and the sort control sit next to each other, so
 * two copies would drift into two slightly different controls on one row.
 */
export const nativeSelectCls =
  "flex h-9 w-full cursor-pointer rounded-lg border border-input bg-white px-3 text-sm text-soft-black transition-colors focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:cursor-not-allowed disabled:opacity-50";
