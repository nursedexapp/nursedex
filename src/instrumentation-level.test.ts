// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import {
  NodeClient,
  defaultStackParser,
  createTransport,
  setCurrentClient,
  type Event,
} from "@sentry/nextjs";
import { onRequestError } from "./instrumentation";
import { UNATTRIBUTABLE_POST } from "@/lib/sentry/alert-tags";

/**
 * A decision to report at `warning` is worth nothing until the event Sentry
 * actually sends carries that level (L3), and the route from a scope to an
 * event runs through two scope forks: ours, and the one
 * `Sentry.captureRequestError` opens internally. Nothing about that is
 * asserted by a mock of Sentry, so this drives the real SDK and reads the
 * level off the finished event.
 *
 * The level is the whole mechanism separating a Slack page from a quiet
 * record: src/lib/sentry/issues.ts polls
 * `is:for_review level:[error,fatal] ...`, so an event at `warning` is visible
 * in Sentry and is never relayed (NURSEDEX-SITE-11).
 *
 * Every Sentry symbol here comes from @sentry/nextjs and none from
 * @sentry/core or @sentry/node. The nextjs package carries its OWN bundled
 * copy of core, so a client registered through @sentry/core is a different
 * module's client: `getClient()` disagrees between the two and the capture
 * reaches nothing, which reads as the code under test never having run.
 */
let captured: Event[] = [];

beforeEach(() => {
  captured = [];
  const client = new NodeClient({
    dsn: "https://examplePublicKey@o0.ingest.sentry.io/0",
    stackParser: defaultStackParser,
    integrations: [],
    transport: () =>
      createTransport({ recordDroppedEvent: () => {} }, () =>
        Promise.resolve({}),
      ),
    beforeSend(event) {
      captured.push(event);
      // Dropped after capture: this test is about the level on the event, and
      // nothing should leave the machine.
      return null;
    },
  });
  setCurrentClient(client);
  client.init();
});

const request = (headers: Record<string, string>) => ({
  path: "/",
  method: "POST",
  headers,
});

const context = {
  routerKind: "App Router" as const,
  routePath: "/(public)/page",
  routeType: "action" as const,
  revalidateReason: undefined,
};

// The SITE-11 request: curl, but carrying an Origin of this site.
const curlWithOrigin = {
  host: "nursedex.com",
  "x-forwarded-proto": "https",
  origin: "https://nursedex.com",
  "user-agent": "curl/8.7.1",
  "content-type": "multipart/form-data; boundary=------------------------un7W",
};

const actionNotFound = () =>
  new Error(
    "Failed to find Server Action. This request might be from an older or newer deployment.\n" +
      "Read more: https://nextjs.org/docs/messages/failed-to-find-server-action",
  );

describe("the level on the event Sentry actually sends", () => {
  it("sends the action-not-found event at warning, below the alert query", async () => {
    onRequestError(actionNotFound(), request(curlWithOrigin), context);
    await new Promise((resolve) => setImmediate(resolve));

    expect(captured).toHaveLength(1);
    expect(captured[0].level).toBe("warning");
  });

  it("tags the action-not-found event so the alert query can exclude it", async () => {
    // The level alone cannot keep this out of Slack. Sentry's issue search
    // matches a group when ANY of its events carries the value, and the
    // SITE-11 group already holds error level events from before #1098, so it
    // answers `level:[error,fatal]` for ever. The tag is the working lever,
    // and this asserts it reaches the finished event rather than the call.
    onRequestError(actionNotFound(), request(curlWithOrigin), context);
    await new Promise((resolve) => setImmediate(resolve));

    expect(captured).toHaveLength(1);
    expect(captured[0].tags?.[UNATTRIBUTABLE_POST.key]).toBe(
      UNATTRIBUTABLE_POST.value,
    );
  });

  it("does not tag a real crash, which must still be relayed", async () => {
    onRequestError(
      new Error("Supabase read failed"),
      request(curlWithOrigin),
      context,
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(captured).toHaveLength(1);
    expect(captured[0].tags?.[UNATTRIBUTABLE_POST.key]).toBeUndefined();
  });

  it("still sends a real crash at error, so it is still relayed to Slack", async () => {
    onRequestError(
      new Error("Supabase read failed"),
      request(curlWithOrigin),
      context,
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(captured).toHaveLength(1);
    expect(captured[0].level).toBe("error");
  });
});
