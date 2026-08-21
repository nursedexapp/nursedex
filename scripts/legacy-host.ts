/**
 * Watches the original Supabase project host (#744).
 *
 * NurseDex has a custom domain, auth.nursedex.com, but the application was
 * deliberately NOT moved onto it (#741, closed as not needed: activating the
 * domain fixed the Google consent screen on its own). So every database read,
 * every storage object and every API call still goes to the original project
 * host, and that is now the permanent arrangement rather than a transitional
 * one. Published blog images additionally have that host baked into them as
 * absolute URLs in blog_posts.cover_image_url.
 *
 * All of which rests on one sentence in Supabase's documentation: the project
 * domain "continues to work and serve requests" after a custom domain is
 * activated. That was measured once, at activation, and nothing has looked
 * since. If Supabase ever changes it, the first person to find out should be a
 * scheduled check rather than a family looking at a blank page.
 *
 * The host is a LITERAL here, deliberately not read from the environment. The
 * point is to watch this specific host even if the app is one day repointed
 * elsewhere, because the stored blog image URLs will still name it.
 */
export const LEGACY_SUPABASE_HOST = "fisuhtkzhyttdmqoivlp.supabase.co";

/** The project this host must identify itself as. Derived, so the two cannot drift. */
export const LEGACY_PROJECT_REF = LEGACY_SUPABASE_HOST.split(".")[0];

const LEGACY_ORIGIN = `https://${LEGACY_SUPABASE_HOST}`;

/**
 * A URL the check attempted, and what came back.
 *
 * The two kinds are judged by different rules on purpose.
 *
 * An "object" probe fetches a real published blog image and wants HTTP 200,
 * because that is literally what a reader's browser does.
 *
 * An "identity" probe asks whether OUR Supabase project is still answering on
 * this hostname, and is judged by the `sb-project-ref` response header rather
 * than the status. Measured 2026-08-21: /auth/v1/health with no apikey returns
 * 401 and still carries that header, while a non Supabase host on the same name
 * returns 404 with no header at all. So the fingerprint is both stronger than a
 * status check (it proves WHICH project answered, not merely that something
 * did) and cheaper (it needs no credential in CI). Judging it by status would
 * fail forever against a perfectly healthy host, which is exactly what the first
 * version of this check did.
 */
export interface HostCheck {
  kind: "object" | "identity";
  url: string;
  /** null when the request never completed at all. */
  status: number | null;
  /** identity probes only: the project the host reported, if any. */
  projectRef?: string | null;
  error?: string;
}

export interface LegacyHostResult {
  ok: boolean;
  checked: number;
  failures: HostCheck[];
}

/** The endpoint that proves the legacy host is still answering as our project. */
export function legacyHealthUrl(): string {
  return `${LEGACY_ORIGIN}/auth/v1/health`;
}

/**
 * Every published cover image still served from the legacy host.
 *
 * THROWS rather than returning an empty list when there is nothing to check.
 * That is the whole point: a check with nothing to look at must fail loudly,
 * because "found no broken images" and "never looked at any images" produce
 * the same reassuring silence otherwise. The two empty cases get separate
 * messages, since they mean different things and want different responses:
 * no posts at all is a fixture or query problem, while posts that have all
 * moved off the legacy host means this check has outlived its purpose.
 */
export function collectLegacyImageUrls(
  posts: { cover_image_url?: string | null }[],
): string[] {
  if (posts.length === 0) {
    throw new Error(
      "Legacy host check found no posts at all. The query returned nothing, so " +
        "nothing was verified. This is a failure, not a healthy result.",
    );
  }

  const urls = posts
    .map((p) => p.cover_image_url)
    .filter((u): u is string => typeof u === "string" && u.startsWith(LEGACY_ORIGIN));

  if (urls.length === 0) {
    throw new Error(
      `Legacy host check found no blog image on the legacy host (${LEGACY_SUPABASE_HOST}). ` +
        "Either every post has moved off it, in which case this check has outlived " +
        "its purpose and should be retired deliberately, or the query is wrong. " +
        "Refusing rather than reporting a healthy host nobody actually checked.",
    );
  }

  return urls;
}

/** Decide whether the legacy host is still serving what the app depends on. */
export function evaluateLegacyHost(checks: HostCheck[]): LegacyHostResult {
  // Nothing checked is not success. Without this, an empty list satisfies
  // "every check passed" and the whole guard reports green while blind.
  if (checks.length === 0) {
    return { ok: false, checked: 0, failures: [] };
  }

  const failures = checks.filter((c) => {
    // A request that never completed is a failure whatever kind it was.
    if (c.error !== undefined) return true;
    return c.kind === "identity"
      ? c.projectRef !== LEGACY_PROJECT_REF
      : c.status !== 200;
  });
  return { ok: failures.length === 0, checked: checks.length, failures };
}

/**
 * A report for whoever the failure pages. It names the consequence, not just
 * the symptom, because "a URL returned 404" does not tell anyone what to do
 * and this particular 404 means published blog posts have gone blank.
 */
export function formatLegacyHostReport(result: LegacyHostResult): string {
  if (result.ok) {
    return `Legacy Supabase host OK. ${result.checked} URL(s) on ${LEGACY_SUPABASE_HOST} still serving.`;
  }

  if (result.checked === 0) {
    return (
      `Legacy Supabase host UNVERIFIED. Nothing was checked, so nothing is known. ` +
      `Treat this as a failure: the check did not run, it did not pass.`
    );
  }

  const lines = result.failures.map((f) => {
    if (f.error !== undefined) return `  ${f.url}\n    ${f.error}`;
    if (f.kind === "identity") {
      return (
        `  ${f.url}\n    identified as ${f.projectRef ?? "nothing"}, ` +
        `expected ${LEGACY_PROJECT_REF} (HTTP ${f.status})`
      );
    }
    return `  ${f.url}\n    HTTP ${f.status}`;
  });

  return [
    `Legacy Supabase host FAILING. ${result.failures.length} of ${result.checked} URL(s) on ${LEGACY_SUPABASE_HOST} are no longer serving.`,
    "",
    ...lines,
    "",
    "Why this matters: the NurseDex app talks to this host for every database",
    "read, storage object and API call, and published blog images have it baked",
    "into their stored addresses. If it has stopped serving, blog images are",
    "blank and the app is degraded or down. See #744.",
  ].join("\n");
}
