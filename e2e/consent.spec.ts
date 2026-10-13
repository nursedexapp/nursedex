import { gunzipSync } from "node:zlib";
import {
  test,
  expect,
  type BrowserContext,
  type Page,
  type Request,
} from "@playwright/test";

// The cookie bar is what this spec tests, so it starts with no answer, unlike
// every other spec (playwright.config.ts seeds a Decline for those).
//
// PostHog drops every event from a browser it takes for a bot, and it reads a
// Playwright browser as one three ways: "HeadlessChrome" in the user agent or
// its brands, and navigator.webdriver (isLikelyBot in posthog-js). Measured:
// without this, Accept starts PostHog, it fetches its config and flags, and
// then sends nothing at all, so no test here could see an event, and a
// withdrawal that left PostHog running would look exactly like one that
// stopped it. So the spec presents an ordinary desktop Chrome.
//
// bypassCSP: the e2e Sentry DSN is on sentry.invalid (playwright.config.ts),
// which the CSP's connect-src does not list, so the browser would refuse the
// envelope before any request exists and the route below would never see it.
test.use({
  storageState: { cookies: [], origins: [] },
  bypassCSP: true,
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
});

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "webdriver", {
      get: () => false,
    });
    Object.defineProperty(Navigator.prototype, "userAgentData", {
      get: () => undefined,
    });
  });
});

type Seen = {
  /** Every request PostHog made through the /ingest proxy. */
  ingest: string[];
  /** The names of the events inside those requests, decoded. */
  events: string[];
  /** Sentry replay envelopes: the recording of a session. */
  replays: number;
  /** Sentry error envelopes, whole, so a test can find its own error. */
  errors: string[];
  /** Bodies of the banner's server action calls, which would count a tally. */
  tally: string[];
  /** Every request this context made to a host off this machine. */
  offMachine: Request[];
  /** Requests a route here answered, so they never reached the network. */
  answered: Set<Request>;
};

const ON_MACHINE = new Set(["localhost", "127.0.0.1", "[::1]"]);

let watched: Seen | null = null;

// Nothing this spec does may reach a real service: PostHog and Sentry are
// pointed at addresses that cannot leave the machine, and anything sent
// anywhere else must have been answered by a route here.
test.afterEach(() => {
  const seen = watched;
  watched = null;
  if (!seen) return;
  expect(
    seen.offMachine.filter((r) => !seen.answered.has(r)).map((r) => r.url()),
    "requests that left this machine",
  ).toEqual([]);
});

/**
 * PostHog batches events and sends them as JSON, gzip, or a base64 form field.
 * Decoded so a test can ask which events went out, not only that some
 * request did: the flags and config fetches are requests too, and carry no
 * event.
 */
function decodeEvents(request: Request): string[] {
  const raw = request.postDataBuffer();
  if (!raw || raw.length === 0) return [];
  let text: string;
  if (raw[0] === 0x1f && raw[1] === 0x8b) {
    text = gunzipSync(raw).toString("utf8");
  } else {
    text = raw.toString("utf8");
    if (text.startsWith("data=")) {
      const field = new URLSearchParams(text).get("data") ?? "";
      text = Buffer.from(field, "base64").toString("utf8");
    }
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      `Could not decode a PostHog request body from ${request.url()}; ` +
        "the payload format changed, so this spec can no longer read events.",
    );
  }
  const items = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && "batch" in parsed
      ? (parsed as { batch: unknown[] }).batch
      : [parsed];
  return items.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const { event } = item as { event?: unknown };
    return typeof event === "string" ? [event] : [];
  });
}

/**
 * Intercepts PostHog, Sentry and the banner's tally so nothing leaves the
 * machine and no test writes a count to any database, and records what was
 * attempted. On the context, so a page opened by a reload is covered as well.
 */
async function watch(context: BrowserContext): Promise<Seen> {
  const seen: Seen = {
    ingest: [],
    events: [],
    replays: 0,
    errors: [],
    tally: [],
    offMachine: [],
    answered: new Set(),
  };
  watched = seen;
  context.on("request", (request) => {
    const url = new URL(request.url());
    if (!/^https?:$/.test(url.protocol)) return;
    if (!ON_MACHINE.has(url.hostname)) seen.offMachine.push(request);
  });

  // Registered first, so it runs last: Playwright tries the newest route
  // first, and this one passes on everything that is not a server action.
  await context.route("**/*", async (route) => {
    const request = route.request();
    if (request.headers()["next-action"] === undefined) {
      await route.fallback();
      return;
    }
    seen.tally.push(request.postData() ?? "");
    seen.answered.add(request);
    // Not a valid action response, so the banner sees a failed count and
    // carries on, exactly as it does when the tally is unreachable.
    await route.fulfill({ status: 200, contentType: "text/plain", body: "" });
  });

  await context.route("**/ingest/**", async (route) => {
    const request = route.request();
    seen.ingest.push(request.url());
    seen.answered.add(request);
    seen.events.push(...decodeEvents(request));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}",
    });
  });

  // The DSN's ingest URL is https://<host>/api/<project>/envelope/?sentry_key=...
  // (dsnToString and getEnvelopeEndpoint in @sentry/core), whatever the host.
  await context.route("**/api/*/envelope/**", async (route) => {
    seen.answered.add(route.request());
    const body = route.request().postDataBuffer()?.toString("latin1") ?? "";
    if (body.includes('"type":"replay_event"')) seen.replays += 1;
    if (body.includes('"type":"event"')) seen.errors.push(body);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}",
    });
  });

  return seen;
}

/** The banner marks the page once hydration knows the answer; asserting before that proves nothing. */
async function settled(page: Page, state: string) {
  await expect(
    page.locator(`html[data-consent-state="${state}"]`),
  ).toBeAttached();
  await page.waitForLoadState("networkidle");
}

/** An uncaught error, which Sentry reports and which flushes a buffered replay. */
async function throwInPage(page: Page, message: string) {
  await page.evaluate((m) => {
    setTimeout(() => {
      throw new Error(m);
    });
  }, message);
}

/** The Sentry error report carrying this message, if one was sent. */
function reportOf(seen: Seen, message: string): string | undefined {
  return seen.errors.find((body) => body.includes(message));
}

async function phStorage(page: Page): Promise<string[]> {
  return page.evaluate(() => [
    ...Object.keys(window.localStorage).filter((k) => k.startsWith("ph_")),
    ...document.cookie
      .split(";")
      .map((c) => c.trim().split("=")[0])
      .filter((k) => k.startsWith("ph_")),
  ]);
}

const bar = (page: Page) =>
  page.getByRole("region", { name: "Privacy choices" });

// Replay sends its buffer a few seconds after the error that triggers it.
const REPLAY_TIMEOUT = 30_000;
// PostHog sends what it has queued every 3 seconds.
const PH_FLUSH_TIMEOUT = 15_000;

test("nothing runs before Accept, and it all starts after", async ({
  page,
  context,
}) => {
  const seen = await watch(context);
  await page.goto("/");
  await settled(page, "none");
  await expect(bar(page)).toBeVisible();

  // The banner's showing is counted by a server action. Proves the
  // interception is catching that real call, so no run writes a count.
  await expect
    .poll(() => seen.tally.some((body) => body.includes("shown")))
    .toBe(true);

  await page.goto("/nurses");
  await settled(page, "none");

  // An error before consent: Sentry may report it, but no replay goes with it.
  // A replay is sent seconds AFTER its error, so an empty replay count read
  // the moment the error arrives would pass whether replay was running or
  // not (measured: it did). The error report itself says: while replay is
  // recording, Sentry tags every error with its replayId, in the same request.
  const before = "consent e2e probe before Accept";
  await throwInPage(page, before);
  await expect.poll(() => reportOf(seen, before)).toBeDefined();
  expect(
    reportOf(seen, before)?.includes('"replayId"'),
    "the error report sent before Accept is tagged with a replay",
  ).toBe(false);
  expect(seen.ingest).toEqual([]);
  expect(await phStorage(page)).toEqual([]);

  // Positive controls: without these, empty lists could mean neither could run.
  await bar(page).getByRole("button", { name: "Accept" }).click();
  // An event, not only the flags fetch: PostHog is capturing, not just loaded.
  // It flushes its queue every 3 seconds.
  await expect
    .poll(() => seen.events, { timeout: PH_FLUSH_TIMEOUT })
    .toContain("$pageview");
  // A different message, or Sentry's dedupe drops it as a repeat and no
  // replay is ever triggered.
  const after = "consent e2e probe after Accept";
  await throwInPage(page, after);
  await expect
    .poll(() => reportOf(seen, after)?.includes('"replayId"'), {
      message: "the error report sent after Accept is tagged with a replay",
    })
    .toBe(true);
  await expect
    .poll(() => seen.replays, { timeout: REPLAY_TIMEOUT })
    .toBeGreaterThan(0);
});

test("withdrawing on a live page stops tracking for the rest of the visit", async ({
  page,
  context,
}) => {
  const seen = await watch(context);
  await page.goto("/");
  await settled(page, "none");
  await bar(page).getByRole("button", { name: "Accept" }).click();
  // Positive controls: PostHog is capturing, and its identity is stored here,
  // so the checks below that both have stopped can fail.
  await expect
    .poll(() => seen.events, { timeout: PH_FLUSH_TIMEOUT })
    .toContain("$pageview");
  expect(await phStorage(page)).not.toEqual([]);

  await page.getByRole("button", { name: "Privacy choices" }).first().click();
  // Registered before the click, so a reload that finishes quickly is not missed.
  const reloaded = page.waitForEvent("load");
  // Handled now, so a failure below does not also report this wait as an
  // unhandled rejection when the test ends; awaiting it later still throws.
  reloaded.catch(() => {});
  await bar(page).getByRole("button", { name: "Decline" }).click();

  // PostHog's visitor id is gone from this browser. Polled, because the page
  // may be reloading underneath the check.
  await expect
    .poll(() => phStorage(page).catch(() => ["(page reloading)"]))
    .toEqual([]);

  // The rest of the visit: the page the Decline left behind, then a move to
  // another page of the site, as a visitor would.
  await reloaded;
  await settled(page, "declined");
  // A flat count below is NOT the evidence that withdrawal works: with
  // withdrawPostHog broken it stayed flat in 3 of 3 runs, because nothing on
  // the live page sends within a bounded wait. The identity poll above is
  // what fails. This guards the fresh page after the reload.
  const after = seen.ingest.length;
  await page.getByRole("link", { name: "Find a Nurse" }).first().click();
  await page.waitForURL("**/nurses");
  await settled(page, "declined");
  expect(seen.ingest.length).toBe(after);
  expect(await phStorage(page)).toEqual([]);
});

test("Decline keeps everything off across pages and reloads", async ({
  page,
  context,
}) => {
  const seen = await watch(context);
  await page.goto("/");
  await settled(page, "none");
  await bar(page).getByRole("button", { name: "Decline" }).click();
  await page.reload();
  await settled(page, "declined");
  await page.goto("/pricing");
  await settled(page, "declined");
  await expect(bar(page)).toBeHidden();
  expect(seen.ingest).toEqual([]);
  expect(await phStorage(page)).toEqual([]);
});

test("Global Privacy Control: no bar and nothing runs", async ({
  page,
  context,
}) => {
  const seen = await watch(context);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "globalPrivacyControl", { value: true });
  });
  await page.goto("/");
  await settled(page, "signal");
  await expect(bar(page)).toBeHidden();
  expect(seen.ingest).toEqual([]);
  expect(seen.tally).toEqual([]);
});
