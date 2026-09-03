// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  supabaseCspSources,
  supabaseImageRemotePatterns,
  trustedSupabaseHosts,
  trustedSupabaseOrigin,
} from "./trusted-hosts";

// The three states NEXT_PUBLIC_SUPABASE_URL is ever in. Every function here
// takes the raw value as an argument so the configured states can be
// exercised without resetting the module registry.
//
// The ABSENT state cannot be: the argument DEFAULTS to process.env, so
// passing undefined reads whatever the machine happens to have set. These
// tests therefore clear it themselves rather than inheriting it, or they pass
// only on a machine with no Supabase URL exported and fail for anyone who has
// sourced a normal .env before running them.
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});
const PRODUCTION = "https://fisuhtkzhyttdmqoivlp.supabase.co";
const LOCAL = "http://127.0.0.1:54321";

describe("trustedSupabaseOrigin", () => {
  it("is the origin of the URL the app is pointed at", () => {
    expect(trustedSupabaseOrigin(PRODUCTION)).toBe(PRODUCTION);
    expect(trustedSupabaseOrigin(LOCAL)).toBe(LOCAL);
  });

  it("is null when the value is absent or does not parse", () => {
    expect(trustedSupabaseOrigin(undefined)).toBeNull();
    expect(trustedSupabaseOrigin("")).toBeNull();
    expect(trustedSupabaseOrigin("not a url")).toBeNull();
  });
});

describe("trustedSupabaseHosts", () => {
  it("is exactly the one host the app is pointed at", () => {
    expect(trustedSupabaseHosts(PRODUCTION)).toEqual([
      "fisuhtkzhyttdmqoivlp.supabase.co",
    ]);
  });

  it("keeps the port, because a local stack is only reachable with it", () => {
    expect(trustedSupabaseHosts(LOCAL)).toEqual(["127.0.0.1:54321"]);
  });

  // Fail CLOSED here, unlike the CSP and remotePatterns below. This list
  // decides which image sources inside admin-authored post bodies are
  // rendered at all, so an unconfigured app must render none rather than
  // widen the allowlist for authored content.
  it("is empty when the value is absent or does not parse", () => {
    expect(trustedSupabaseHosts(undefined)).toEqual([]);
    expect(trustedSupabaseHosts("not a url")).toEqual([]);
  });
});

describe("supabaseCspSources", () => {
  it("narrows to the one project, not to every Supabase tenant", () => {
    const csp = supabaseCspSources(PRODUCTION);
    expect(csp.http).toBe(PRODUCTION);
    expect(csp.ws).toBe("wss://fisuhtkzhyttdmqoivlp.supabase.co");
  });

  it("allows a local stack over plain http and ws", () => {
    const csp = supabaseCspSources(LOCAL);
    expect(csp.http).toBe(LOCAL);
    expect(csp.ws).toBe("ws://127.0.0.1:54321");
  });

  // Deliberate and locked in by src/proxy.test.ts as well: a missing env var
  // must never produce a CSP that blocks Supabase outright, because that
  // takes the whole app down rather than degrading it.
  it("falls open to the wildcard when nothing is configured", () => {
    const csp = supabaseCspSources(undefined);
    expect(csp.http).toBe("https://*.supabase.co");
    expect(csp.ws).toBe("wss://*.supabase.co");
  });
});

describe("supabaseImageRemotePatterns", () => {
  // A remotePatterns miss THROWS in next/image rather than degrading, so an
  // empty list takes down nurse search and every sized blog image. There is
  // no env state in which this may be empty.
  it.each([
    ["production", PRODUCTION],
    ["a local stack", LOCAL],
    ["nothing configured", undefined],
    ["a malformed value", "not a url"],
  ])("is never empty with %s", (_label, raw) => {
    expect(supabaseImageRemotePatterns(raw).length).toBeGreaterThan(0);
  });

  it("trusts only this project's storage in production", () => {
    expect(supabaseImageRemotePatterns(PRODUCTION)).toEqual([
      {
        protocol: "https",
        hostname: "fisuhtkzhyttdmqoivlp.supabase.co",
        pathname: "/storage/v1/object/**",
      },
    ]);
  });

  it("no longer trusts every other Supabase tenant in production", () => {
    const hostnames = supabaseImageRemotePatterns(PRODUCTION).map(
      (p) => p.hostname,
    );
    expect(hostnames).not.toContain("*.supabase.co");
  });

  it("trusts a local stack, port and plain http included", () => {
    expect(supabaseImageRemotePatterns(LOCAL)).toEqual([
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "54321",
        pathname: "/storage/v1/object/**",
      },
    ]);
  });

  it("falls open to the wildcard when nothing is configured", () => {
    expect(supabaseImageRemotePatterns(undefined)).toEqual([
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/**",
      },
    ]);
  });
});

describe("reporting a misconfigured value", () => {
  // Kept unique per test: the module reports each distinct bad value once, so
  // a value another test already used would report nothing here.
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Absent and malformed reach the same fallback but are different causes, and
  // only one of them is a mistake. A typo in the Vercel value would otherwise
  // ship the fail-open wildcard silently: the CSP and remotePatterns would
  // quietly widen back to every Supabase tenant and nothing would say so.
  it("says nothing when the value is simply absent", () => {
    supabaseCspSources(undefined);
    supabaseImageRemotePatterns(undefined);
    trustedSupabaseHosts(undefined);
    expect(warn).not.toHaveBeenCalled();
  });

  it("names the value and the consequence when it does not parse", () => {
    supabaseCspSources("broken one, not a url");
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0][0]);
    expect(message).toContain("broken one, not a url");
    expect(message).toContain("*.supabase.co");
  });

  // A bad value is read on every render of every blog image. One report per
  // distinct value, so the signal is not buried under its own repetition.
  it("reports each distinct bad value once", () => {
    supabaseCspSources("broken two, not a url");
    supabaseImageRemotePatterns("broken two, not a url");
    trustedSupabaseHosts("broken two, not a url");
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
