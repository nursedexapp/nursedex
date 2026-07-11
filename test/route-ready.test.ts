// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { waitForRouteReady } from "./route-ready";

/** A fetch stub that returns the given statuses in order, then repeats the last. */
function fetchReturning(...statuses: (number | "throw")[]) {
  let i = 0;
  return vi.fn(async () => {
    const next = statuses[Math.min(i, statuses.length - 1)];
    i++;
    if (next === "throw") throw new Error("ECONNREFUSED");
    return { status: next } as Response;
  });
}

describe("waitForRouteReady", () => {
  it("resolves as soon as the route is served", async () => {
    const fetchImpl = fetchReturning(200);
    await expect(
      waitForRouteReady("http://localhost:3000/blog", { fetchImpl }),
    ).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("treats a redirect as served, since a gated route answers with one", async () => {
    // An unauthenticated GET of /admin/blog should 307 to /login. That is a
    // correctly-routed response, not a missing route.
    const fetchImpl = fetchReturning(307);
    await expect(
      waitForRouteReady("http://localhost:3000/admin/blog", { fetchImpl }),
    ).resolves.toBeUndefined();
  });

  it("keeps polling while the dev server still reports the route missing", async () => {
    // The Turbopack dev server 404s a route it has not compiled yet. That is
    // the whole flake: the route appears a moment later.
    const fetchImpl = fetchReturning(404, 404, 307);
    await waitForRouteReady("http://localhost:3000/admin/blog", {
      fetchImpl,
      intervalMs: 1,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("keeps polling while the server is not accepting connections yet", async () => {
    const fetchImpl = fetchReturning("throw", 200);
    await waitForRouteReady("http://localhost:3000/blog", {
      fetchImpl,
      intervalMs: 1,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("fails loudly with an actionable message when the route never appears", async () => {
    // Failing here, before any spec runs, beats a spec timing out on a missing
    // heading and sending the next person hunting through the wrong code.
    const fetchImpl = fetchReturning(404);
    await expect(
      waitForRouteReady("http://localhost:3000/admin/blog", {
        fetchImpl,
        intervalMs: 1,
        timeoutMs: 20,
      }),
    ).rejects.toThrow(/\/admin\/blog.*404/);
  });

  it("surfaces a connection failure in the timeout message rather than hiding it", async () => {
    const fetchImpl = fetchReturning("throw");
    await expect(
      waitForRouteReady("http://localhost:3000/blog", {
        fetchImpl,
        intervalMs: 1,
        timeoutMs: 20,
      }),
    ).rejects.toThrow(/ECONNREFUSED/);
  });
});
