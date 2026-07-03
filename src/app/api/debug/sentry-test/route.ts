export const dynamic = "force-dynamic";

/**
 * TEMPORARY diagnostic route to confirm Sentry is actually capturing
 * server-side errors after wiring it up (#394). Delete this file once
 * verified.
 */
export async function GET(): Promise<never> {
  throw new Error("Sentry test: deliberate server-side error");
}
