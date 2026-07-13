// @vitest-environment node
//
// The alert path, including every way it can fail.
//
// This check exists to shout when production's permissions break. An alerter
// that throws takes the whole job down before it can print WHY, and one that
// fails quietly leaves a red job nobody hears about. Both are worse than
// useless, so both are tested.
import { describe, it, expect, vi } from "vitest";
import { announce } from "./prod-smoke-notify";
import { ALERTS_CHANNEL_ID } from "../src/lib/slack/constants";

const REPORT = "authenticated can no longer EXECUTE get_nurse_contact.";

// Typed to fetch's own signature. A bare `vi.fn(async () => ...)` takes no
// arguments as far as tsc is concerned, so reading mock.calls[0] fails the
// typecheck in CI even though vitest runs it happily.
function okFetch() {
  return vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ ok: true })),
  );
}

describe("announce", () => {
  it("posts the report to the alerts channel", async () => {
    const fetchImpl = okFetch();
    const log = vi.fn();

    await announce({ report: REPORT, token: "xoxb-test", fetchImpl, log });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toContain("chat.postMessage");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer xoxb-test" });

    const body = JSON.parse(init?.body as string) as {
      channel: string;
      text: string;
    };
    expect(body.channel).toBe(ALERTS_CHANNEL_ID);
    expect(body.text).toContain(REPORT);
  });

  // Not silent. Without this, a missing token means no Slack ping and no
  // explanation, and the alert simply never arrives with nobody the wiser.
  it("says so in the log when there is no token, and sends nothing", async () => {
    const fetchImpl = okFetch();
    const log = vi.fn();

    await announce({ report: REPORT, token: undefined, fetchImpl, log });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("SLACK_BOT_TOKEN"),
    );
  });

  // Slack answers 200 with {ok:false} for a bad token or channel. Treating that
  // as delivered is how an alert quietly stops arriving.
  it("logs when Slack rejects the message, and never throws", async () => {
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ ok: false, error: "channel_not_found" })),
    );
    const log = vi.fn();

    await expect(
      announce({ report: REPORT, token: "xoxb-test", fetchImpl, log }),
    ).resolves.toBeUndefined();

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("channel_not_found"),
    );
  });

  // The smoke failure is the thing that matters. If Slack is down, the job must
  // still report the broken grant and exit non-zero, not die inside the alerter.
  it("swallows a network failure rather than crashing the run that found the bug", async () => {
    const fetchImpl = vi.fn(
      async (
        _input: RequestInfo | URL,
        _init?: RequestInit,
      ): Promise<Response> => {
        throw new Error("getaddrinfo ENOTFOUND slack.com");
      },
    );
    const log = vi.fn();

    await expect(
      announce({ report: REPORT, token: "xoxb-test", fetchImpl, log }),
    ).resolves.toBeUndefined();

    expect(log).toHaveBeenCalledWith(expect.stringContaining("ENOTFOUND"));
  });
});
