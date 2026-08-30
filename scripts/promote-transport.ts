// The HTTP layer for the production promotion gate (#817): the URLs it builds
// and how it reads a response.
//
// Separate and injectable because this is where it fails silently. A wrong URL
// returns an empty list that reads as "no deployment", and a status nobody
// checks turns a refusal into a success. Neither is visible from the decision
// logic, which is why the push gate was right to ask for this.
import type { CheckRun, Deployment } from "./promote-production";

/** Identifiers, not credentials: they appear in every Vercel URL. */
export const VERCEL_PROJECT_ID = "prj_54cMSI8CuaFPdcoZpJHNP9lCFJQb";
export const VERCEL_TEAM_ID = "team_KyFUxRqFFhnrWORtkUBwNjBC";

/** Just enough of fetch to be swapped in a test. */
export type Fetcher = (
  url: string,
  init?: { method?: string; headers?: Record<string, string> },
) => Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}>;

async function request(
  fetcher: Fetcher,
  url: string,
  token: string,
  what: string,
  method = "GET",
): Promise<unknown> {
  const response = await fetcher(url, {
    method,
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    // The status ALWAYS, not only the body. A response that carries no body
    // would otherwise read as no information rather than as the diagnosis it
    // is (L520).
    const body = await response.text().catch(() => "");
    throw new Error(
      `${what} failed: ${response.status} ${response.statusText}` +
        (body ? `: ${body.slice(0, 300)}` : ""),
    );
  }

  return method === "GET" ? await response.json() : null;
}

export function deploymentsUrl(sha: string): string {
  return (
    `https://api.vercel.com/v7/deployments?projectId=${VERCEL_PROJECT_ID}` +
    `&teamId=${VERCEL_TEAM_ID}&sha=${sha}&limit=20`
  );
}

export function checksUrl(repo: string, sha: string): string {
  // filter=latest, so a superseded run cannot answer for the one that replaced
  // it, in either direction (L179).
  return (
    `https://api.github.com/repos/${repo}/commits/${sha}/check-runs` +
    `?filter=latest&per_page=100`
  );
}

export function promoteUrl(uid: string): string {
  return (
    `https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/promote/${uid}` +
    `?teamId=${VERCEL_TEAM_ID}`
  );
}

export async function fetchDeployments(
  fetcher: Fetcher,
  sha: string,
  token: string,
): Promise<Deployment[]> {
  const body = (await request(
    fetcher,
    deploymentsUrl(sha),
    token,
    `Listing Vercel deployments for ${sha}`,
  )) as { deployments?: Deployment[] };
  return body?.deployments ?? [];
}

export async function fetchChecks(
  fetcher: Fetcher,
  repo: string,
  sha: string,
  token: string,
): Promise<CheckRun[]> {
  const body = (await request(
    fetcher,
    checksUrl(repo, sha),
    token,
    `Reading checks on ${sha}`,
  )) as { check_runs?: CheckRun[] };
  return body?.check_runs ?? [];
}

export async function postPromotion(
  fetcher: Fetcher,
  uid: string,
  token: string,
): Promise<void> {
  await request(fetcher, promoteUrl(uid), token, `Promoting ${uid}`, "POST");
}
