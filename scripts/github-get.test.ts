// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createGitHubGet } from "./github-get";

function reply(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? "OK" : "Internal Server Error",
  });
}

describe("createGitHubGet", () => {
  it("sends the token and API version, and returns the parsed body", async () => {
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) =>
      reply(200, { ok: 1 }),
    );
    const get = createGitHubGet("tok", {
      fetch: fetchFn,
      sleep: async () => {},
      log: () => {},
    });
    expect(await get("/repos/o/r")).toEqual({ ok: 1 });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.github.com/repos/o/r");
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok");
    expect(headers["X-GitHub-Api-Version"]).toBe("2022-11-28");
  });

  // The 2026-10-13 merge whose proof lookup got one GitHub 500 and so reported
  // "unavailable", which alone put CI Health over its budget on 2026-10-19.
  it("absorbs one server error and returns the retried answer", async () => {
    let calls = 0;
    const fetchFn = async () =>
      calls++ === 0 ? reply(500) : reply(200, { check_runs: [] });
    const lines: string[] = [];
    const get = createGitHubGet("tok", {
      fetch: fetchFn,
      sleep: async () => {},
      log: (line) => lines.push(line),
    });
    expect(await get("/repos/o/r/commits/abc/check-runs")).toEqual({
      check_runs: [],
    });
    expect(calls).toBe(2);
    // Visible in the run list as a warning, so blips growing common show up
    // before they turn into failures (L77).
    expect(lines.join("\n")).toMatch(
      /::warning title=GitHub API retried::.*500.*check-runs/,
    );
  });

  it("throws with the status and path when the retry fails too", async () => {
    const fetchFn = async () => reply(502);
    const get = createGitHubGet("tok", {
      fetch: fetchFn,
      sleep: async () => {},
      log: () => {},
    });
    await expect(get("/repos/o/r")).rejects.toThrow(
      /GitHub API 502 .* for \/repos\/o\/r/,
    );
  });

  it("does not retry a permission refusal, which asking again cannot fix", async () => {
    let calls = 0;
    const fetchFn = async () => {
      calls++;
      return reply(403);
    };
    const get = createGitHubGet("tok", {
      fetch: fetchFn,
      sleep: async () => {},
      log: () => {},
    });
    await expect(get("/repos/o/r")).rejects.toThrow(/403/);
    expect(calls).toBe(1);
  });
});

// Four scripts each carried a hand-written copy of this GET, and none retried,
// so fixing one would have left three that fail on the same blip (L613). Any
// new script reading the GitHub API goes through the shared one.
describe("GitHub API reads in scripts/", () => {
  it("all go through createGitHubGet", () => {
    const dir = join(process.cwd(), "scripts");
    const offenders = readdirSync(dir)
      .filter(
        (f) =>
          f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "github-get.ts",
      )
      .filter((f) =>
        /fetch\(\s*`https:\/\/api\.github\.com/.test(
          readFileSync(join(dir, f), "utf8"),
        ),
      );
    expect(offenders).toEqual([]);
  });
});
