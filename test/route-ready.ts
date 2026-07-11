/**
 * Wait until the dev server actually serves a route.
 *
 * Playwright's `webServer` only waits for the base URL to answer before it
 * starts the suite, but `next dev` (Turbopack) compiles routes on demand and
 * fills its route manifest lazily. A request that arrives in that early window
 * gets a real 404, not a slow response. That is the whole of the
 * authenticated-e2e flake (#623): auth.setup navigated to /admin/blog, was
 * handed the 404 page, and timed out waiting for a "Blog" heading that was
 * never going to appear. The unauthenticated redirect spec 404'd in the same
 * run for the same reason.
 *
 * Raising the assertion timeout would not have helped: a 404 comes back
 * instantly and waiting longer does not turn it into the page. The server has
 * to be asked again.
 *
 * Ready means "this route resolves to something", so any status but 404
 * counts. A gated route answering 307 to /login is correctly routed; so is a
 * 200. Connection errors mean the server is not up yet, so keep waiting.
 */

export interface WaitForRouteReadyOptions {
  /** Injected in tests; defaults to global fetch. */
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
  /** Give up after this long. Turbopack's first compile of a route is slow. */
  timeoutMs?: number;
  intervalMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function waitForRouteReady(
  url: string,
  options: WaitForRouteReadyOptions = {},
): Promise<void> {
  const {
    fetchImpl = fetch,
    timeoutMs = 120_000,
    intervalMs = 500,
  } = options;

  const deadline = Date.now() + timeoutMs;
  let lastReason = "no response yet";

  for (;;) {
    try {
      // `manual` so a gated route's redirect is seen as the redirect it is,
      // rather than being followed to a page that may itself be uncompiled.
      const res = await fetchImpl(url, { redirect: "manual" });
      if (res.status !== 404) return;
      lastReason = "404 (the dev server has not compiled this route)";
    } catch (error) {
      lastReason = error instanceof Error ? error.message : String(error);
    }

    if (Date.now() >= deadline) {
      throw new Error(
        `Timed out after ${timeoutMs}ms waiting for the dev server to serve ${url}. Last response: ${lastReason}. The suite is stopping here on purpose: letting it run would fail a spec somewhere else with a confusing missing-element error instead of pointing at the server.`,
      );
    }

    await sleep(intervalMs);
  }
}
