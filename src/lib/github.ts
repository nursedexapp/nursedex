import "server-only";

// Minimal GitHub REST helpers for the consulting workflow. Uses a
// fine-grained PAT (GITHUB_TOKEN) scoped to this repo with Issues
// read & write. No SDK to keep it dependency-free.

const GITHUB_REPO = "nursedexapp/nursedex";
const API = "https://api.github.com";

function headers(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("Missing GITHUB_TOKEN");
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

export interface CreatedIssue {
  number: number;
  html_url: string;
}

/** Open an issue in the repo. Throws on a non-2xx response. */
export async function createIssue(opts: {
  title: string;
  body: string;
  labels?: string[];
}): Promise<CreatedIssue> {
  const res = await fetch(`${API}/repos/${GITHUB_REPO}/issues`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      title: opts.title,
      body: opts.body,
      labels: opts.labels,
    }),
  });
  if (!res.ok) {
    throw new Error(`GitHub create issue failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as CreatedIssue;
  return { number: data.number, html_url: data.html_url };
}

/** Close an existing issue by number. Throws on a non-2xx response. */
export async function closeIssue(number: number): Promise<void> {
  const res = await fetch(`${API}/repos/${GITHUB_REPO}/issues/${number}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ state: "closed" }),
  });
  if (!res.ok) {
    throw new Error(`GitHub close issue failed: ${res.status} ${await res.text()}`);
  }
}
