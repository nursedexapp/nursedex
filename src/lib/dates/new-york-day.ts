const FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The calendar day in New York as YYYY-MM-DD, matching the tally's `day`. */
export function newYorkDay(at: Date): string {
  return FORMAT.format(at);
}

/**
 * The New York calendar day `days` days before the one `now` falls on, as
 * YYYY-MM-DD. Counts calendar days, not 24 hour steps, so it stays right in
 * the hour either side of a clock change.
 */
export function newYorkDaysAgo(now: Date, days: number): string {
  const [y, m, d] = newYorkDay(now).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10);
}
