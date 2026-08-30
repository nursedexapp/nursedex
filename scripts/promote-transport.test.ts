// @vitest-environment node
//
// The HTTP layer of the production promotion gate (#817), driven rather than
// read as source text.
//
// This is where it fails silently: a wrong URL returns an empty list that reads
// as "no deployment for this commit", and a status nobody checks turns a
// refusal into a success. The decision logic above it cannot see either.
import { describe, it, expect, vi } from "vitest";
import {
  checksUrl,
  deploymentsUrl,
  fetchChecks,
  fetchDeployments,
  postPromotion,
  promoteUrl,
  type Fetcher,
} from "./promote-transport";

const SHA = "abc123";
const TOKEN = "tok";

function ok(body: unknown): ReturnType<Fetcher> {
  return Promise.resolve({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

function failing(status: number, statusText: string, body = ""): ReturnType<Fetcher> {
  return Promise.resolve({
    ok: false,
    status,
    statusText,
    json: async () => ({}),
    text: async () => body,
  });
}

describe("the URLs", () => {
  // Confirmed against Vercel's own OpenAPI spec and a live call, not memory.
  it("filter deployments by commit, scoped to the project and team", () => {
    const url = deploymentsUrl(SHA);
    expect(url).toContain("/v7/deployments");
    expect(url).toContain(`sha=${SHA}`);
    expect(url).toMatch(/projectId=prj_/);
    expect(url).toMatch(/teamId=team_/);
  });

  it("ask GitHub only for the latest run of each check", () => {
    expect(checksUrl("o/r", SHA)).toContain("filter=latest");
    expect(checksUrl("o/r", SHA)).toContain(`/commits/${SHA}/check-runs`);
  });

  it("promote through the documented project endpoint", () => {
    expect(promoteUrl("dpl_1")).toMatch(
      /\/v10\/projects\/prj_[^/]+\/promote\/dpl_1\?teamId=team_/,
    );
  });
});

describe("reading a response", () => {
  it("returns the deployments the API gave", async () => {
    const fetcher = vi.fn(() => ok({ deployments: [{ uid: "dpl_1" }] })) as Fetcher;
    await expect(fetchDeployments(fetcher, SHA, TOKEN)).resolves.toEqual([
      { uid: "dpl_1" },
    ]);
  });

  it("returns the checks the API gave", async () => {
    const fetcher = vi.fn(() => ok({ check_runs: [{ name: "x" }] })) as Fetcher;
    await expect(fetchChecks(fetcher, "o/r", SHA, TOKEN)).resolves.toEqual([
      { name: "x" },
    ]);
  });

  // An absent list is a real answer (no deployment yet); it must not crash.
  it("reads a response with no list as an empty one, not a crash", async () => {
    const fetcher = vi.fn(() => ok({})) as Fetcher;
    await expect(fetchDeployments(fetcher, SHA, TOKEN)).resolves.toEqual([]);
    await expect(fetchChecks(fetcher, "o/r", SHA, TOKEN)).resolves.toEqual([]);
  });

  // The whole reason this layer is tested. A failed request must NOT come back
  // as an empty list, because empty means "nothing to promote" and that reads
  // as a decision rather than as a fault (L215).
  it("throws on a failed request rather than returning nothing", async () => {
    const fetcher = vi.fn(() => failing(403, "Forbidden", "no access")) as Fetcher;
    await expect(fetchDeployments(fetcher, SHA, TOKEN)).rejects.toThrow(/403/);
    await expect(fetchChecks(fetcher, "o/r", SHA, TOKEN)).rejects.toThrow(/403/);
    await expect(postPromotion(fetcher, "dpl_1", TOKEN)).rejects.toThrow(/403/);
  });

  // A response with no body must still say something: an empty payload reads as
  // no information rather than as the diagnosis it is (L520).
  it("names the status even when the response carries no body", async () => {
    const fetcher = vi.fn(() => failing(409, "Conflict")) as Fetcher;
    await expect(postPromotion(fetcher, "dpl_1", TOKEN)).rejects.toThrow(
      /409 Conflict/,
    );
  });

  it("says which call failed, not merely that one did", async () => {
    const fetcher = vi.fn(() => failing(500, "Server Error")) as Fetcher;
    await expect(fetchChecks(fetcher, "o/r", SHA, TOKEN)).rejects.toThrow(
      /Reading checks/,
    );
    await expect(postPromotion(fetcher, "dpl_9", TOKEN)).rejects.toThrow(
      /Promoting dpl_9/,
    );
  });
});

describe("how the requests are made", () => {
  it("sends the token as a bearer, and never in the URL", async () => {
    const fetcher = vi.fn(() => ok({ deployments: [] })) as unknown as Fetcher;
    await fetchDeployments(fetcher, SHA, TOKEN);
    const [url, init] = (fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(url).not.toContain(TOKEN);
  });

  it("promotes with POST, because a GET would silently do nothing", async () => {
    const fetcher = vi.fn(() => ok({})) as unknown as Fetcher;
    await postPromotion(fetcher, "dpl_1", TOKEN);
    const [, init] = (fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.method).toBe("POST");
  });
});
