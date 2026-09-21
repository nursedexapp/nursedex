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

/**
 * What actually leaves for Sentry, read off the finished event through the
 * real SDK rather than a mock (L3).
 *
 * Every Sentry symbol here comes from @sentry/nextjs and none from
 * @sentry/core or @sentry/node. The nextjs package carries its OWN bundled
 * copy of core, so a client registered through @sentry/core is a different
 * module's client: `getClient()` disagrees between the two and the capture
 * reaches nothing, which reads exactly like the code under test never having
 * run.
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

describe("what reaches Sentry from the request error hook", () => {
  it("sends nothing at all for a multipart POST naming no live Server Action", async () => {
    onRequestError(actionNotFound(), request(curlWithOrigin), context);
    await new Promise((resolve) => setImmediate(resolve));

    expect(captured).toEqual([]);
  });

  it("sends nothing for it even without the Origin claim", async () => {
    const { origin: _origin, ...noOrigin } = curlWithOrigin;

    onRequestError(actionNotFound(), request(noOrigin), context);
    await new Promise((resolve) => setImmediate(resolve));

    expect(captured).toEqual([]);
  });

  it("still sends a real crash, at error, so it is still relayed to Slack", async () => {
    onRequestError(
      new Error("Supabase read failed"),
      request(curlWithOrigin),
      context,
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(captured).toHaveLength(1);
    expect(captured[0].level).toBe("error");
  });

  it("carries the request path on a real crash, so it stays diagnosable", async () => {
    onRequestError(new Error("Supabase read failed"), request({}), context);
    await new Promise((resolve) => setImmediate(resolve));

    expect(captured).toHaveLength(1);
    expect(captured[0].contexts?.nextjs?.request_path).toBe("/");
  });
});
