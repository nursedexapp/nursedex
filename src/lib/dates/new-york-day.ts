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
