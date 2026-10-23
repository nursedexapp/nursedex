// The one GitHub REST read every CI script uses.
//
// Four scripts each carried their own copy of this, and none retried, so a
// single GitHub 500 on 2026-10-13 made the merged tree proof report
// "unavailable" and that one blip failed CI Health on 2026-10-19. The read now
// retries once on a 429 or 5xx, and says so in the run as a warning.
import { fetchRetryingOnce, realSleep } from "../src/lib/http/retry-once";

/** Fetches a REST path and returns its parsed JSON, or throws. */
export type GitHubGet = <T = unknown>(path: string) => Promise<T>;

export type GitHubGetDeps = {
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
  sleep?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
};

export function createGitHubGet(
  token: string,
  deps: GitHubGetDeps = {},
): GitHubGet {
  const {
    fetch: fetchFn = fetch,
    sleep = realSleep,
    log = (line) => process.stdout.write(`${line}\n`),
  } = deps;

  return async <T>(path: string): Promise<T> => {
    const url = `https://api.github.com${path}`;
    const init: RequestInit = {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    };
    const response = await fetchRetryingOnce(() => fetchFn(url, init), {
      sleep,
      onRetry: (refused) =>
        log(
          `::warning title=GitHub API retried::GitHub API ${refused.status} ` +
            `for ${path}, retried once`,
        ),
    });
    if (!response.ok) {
      // The body is the diagnosis when there is one, but an empty body must not
      // read as "no information" (L520), so the status is always in the message.
      const body = await response.text().catch(() => "");
      throw new Error(
        `GitHub API ${response.status} ${response.statusText} for ${path}` +
          (body ? `: ${body.slice(0, 300)}` : ""),
      );
    }
    return (await response.json()) as T;
  };
}
