/**
 * The one place the app decides which Supabase hosts it trusts (#740).
 *
 * Three places used to derive this independently: the CSP in src/proxy.ts, the
 * blog renderer's image allowlist in src/lib/blog/render.tsx, and next/image's
 * remotePatterns in next.config.ts. Each read NEXT_PUBLIC_SUPABASE_URL and
 * narrowed it its own way, so the three could disagree with nothing reporting
 * it. They now all call this module.
 *
 * WHICH HOST, AND FOR HOW LONG
 *
 * NurseDex has a custom domain, auth.nursedex.com, but the application was
 * deliberately NOT moved onto it (#741, closed as not needed: activating the
 * domain fixed the Google consent screen on its own). The app stays pointed at
 * the original project host permanently, and published blog images have that
 * host baked into them as absolute URLs. That is a settled decision, not a
 * pending migration, and scripts/legacy-host.ts is the standing check that the
 * host is still serving. There is therefore exactly ONE trusted host, derived
 * from NEXT_PUBLIC_SUPABASE_URL, and no set to keep in sync.
 *
 * WHERE THIS FAILS OPEN, AND WHERE IT FAILS CLOSED
 *
 * The two are different on purpose, because the cost of being wrong differs.
 *
 * The CSP and remotePatterns fail OPEN to the old `*.supabase.co` wildcard when
 * NEXT_PUBLIC_SUPABASE_URL is missing or malformed. A CSP that names no
 * Supabase origin blocks every database call the browser makes, and an empty
 * remotePatterns list makes next/image THROW rather than degrade, taking out
 * nurse search and every sized blog image. A missing env var must not be able
 * to do either.
 *
 * trustedSupabaseHosts fails CLOSED to an empty list. It decides which image
 * sources inside admin-authored post bodies get rendered at all, so an
 * unconfigured app should render none rather than widen an allowlist that
 * exists to contain authored content.
 *
 * A note on the local stack, since deriving the host rather than hardcoding it
 * is what makes it work: production is a *.supabase.co host, but a local or CI
 * stack runs on http://127.0.0.1:54321. Before #485 the profile page crashed
 * with "hostname is not configured under images" the moment a photo existed,
 * and the nurse onboarding journey could not be exercised outside production at
 * all. Both the port and the plain http scheme are carried through for that
 * reason.
 */

/** The fail-open fallback, and the only place the wildcard is still written. */
const WILDCARD_HOSTNAME = "*.supabase.co";

/** Supabase storage serves objects from under this path and nowhere else. */
const STORAGE_OBJECT_PATH = "/storage/v1/object/**";

/**
 * Shaped to be assignable to next/image's RemotePattern without importing
 * Next's internals into a module that next.config.ts itself imports.
 */
export interface SupabaseImagePattern {
  protocol: "http" | "https";
  hostname: string;
  port?: string;
  pathname: string;
}

/** The configured URL, or null when it is absent or does not parse. */
function parseConfigured(raw: string | undefined): URL | null {
  if (!raw) return null;
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

/**
 * The origin the app talks to, e.g. https://fisuhtkzhyttdmqoivlp.supabase.co
 * or http://127.0.0.1:54321 for a local or CI stack. Null when unconfigured.
 */
export function trustedSupabaseOrigin(
  raw: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
): string | null {
  return parseConfigured(raw)?.origin ?? null;
}

/**
 * Hosts (with port, where there is one) that images may be served from.
 * Empty when unconfigured; see the fail-closed note above.
 */
export function trustedSupabaseHosts(
  raw: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
): string[] {
  const url = parseConfigured(raw);
  return url ? [url.host] : [];
}

/**
 * The CSP source expressions for Supabase, one for http(s) and one for the
 * realtime socket. Falls open to the wildcard.
 */
export function supabaseCspSources(
  raw: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
): { http: string; ws: string } {
  const origin = trustedSupabaseOrigin(raw);
  if (!origin) {
    return {
      http: `https://${WILDCARD_HOSTNAME}`,
      ws: `wss://${WILDCARD_HOSTNAME}`,
    };
  }
  return { http: origin, ws: origin.replace(/^http/, "ws") };
}

/**
 * next/image remotePatterns for Supabase storage. Never empty, in any env
 * state; src/next-config-images.test.ts holds that.
 */
export function supabaseImageRemotePatterns(
  raw: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
): SupabaseImagePattern[] {
  const url = parseConfigured(raw);
  if (!url) {
    return [
      {
        protocol: "https",
        hostname: WILDCARD_HOSTNAME,
        pathname: STORAGE_OBJECT_PATH,
      },
    ];
  }

  const port = url.port;
  return [
    {
      protocol: url.protocol.replace(":", "") as "http" | "https",
      hostname: url.hostname,
      ...(port ? { port } : {}),
      pathname: STORAGE_OBJECT_PATH,
    },
  ];
}
