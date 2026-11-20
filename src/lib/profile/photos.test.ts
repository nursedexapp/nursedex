// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const h = vi.hoisted(() => ({
  createSignedUrl: vi.fn(),
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    storage: { from: () => ({ createSignedUrl: h.createSignedUrl }) },
  }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({
  captureMessage: h.captureMessage,
  captureException: h.captureException,
}));

import { firstNursePhotoUrl, getSignedPhotoUrl } from "./photos";
import { ABSORBED_RETRY_TAG } from "@/lib/sentry/absorbed-retry";

const PATH = "8c1f2b3a-0000-4000-8000-000000000001/1785351572329.jpg";
const SIGNED = "https://storage.example/signed?token=abc";

/** What supabase-js hands back when Storage answers with this HTTP status. */
function refusal(status: number | undefined, message: string) {
  return { data: null, error: { name: "StorageApiError", message, status } };
}
// NURSEDEX-SITE-1E, 2026-11-19 and 2026-11-20: the status and the words Storage
// answered with, twice in 13 hours, each time for a single call.
const DB_TIMEOUT = refusal(544, "The connection to the database timed out");
const signed = { data: { signedUrl: SIGNED }, error: null };

describe("getSignedPhotoUrl", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    h.createSignedUrl.mockReset();
    h.captureMessage.mockReset();
    h.captureException.mockReset();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("asks Storage once more after a refusal the next call can survive, and serves the photo", async () => {
    h.createSignedUrl
      .mockResolvedValueOnce(DB_TIMEOUT)
      .mockResolvedValueOnce(signed);
    const sleep = vi.fn(async (_ms: number) => {});

    const url = await getSignedPhotoUrl(PATH, { sleep, random: () => 0.5 });

    expect(url).toBe(SIGNED);
    expect(h.createSignedUrl).toHaveBeenCalledTimes(2);
    // A visitor is waiting on this, so a fraction of a second, and spread so
    // the fifteen photos of one directory page do not all ask again at once.
    expect(sleep).toHaveBeenCalledExactlyOnceWith(450);
  });

  it("counts an absorbed refusal where the Slack relay does not post it", async () => {
    h.createSignedUrl
      .mockResolvedValueOnce(DB_TIMEOUT)
      .mockResolvedValueOnce(signed);

    await getSignedPhotoUrl(PATH, { sleep: async () => {} });

    expect(h.captureException).not.toHaveBeenCalled();
    expect(h.captureMessage).toHaveBeenCalledOnce();
    const [message, context] = h.captureMessage.mock.calls[0];
    expect(message).toContain("544");
    // The path holds a nurse's user id and would split one count into many.
    expect(message).not.toContain(PATH);
    expect(context.level).toBe("warning");
    expect(context.tags).toMatchObject({
      [ABSORBED_RETRY_TAG.key]: ABSORBED_RETRY_TAG.value,
    });
  });

  it("keeps the wait between 300 and 600 milliseconds", async () => {
    for (const [roll, expected] of [
      [0, 300],
      [0.999, 599],
    ]) {
      h.createSignedUrl
        .mockReset()
        .mockResolvedValueOnce(DB_TIMEOUT)
        .mockResolvedValueOnce(signed);
      const sleep = vi.fn(async (_ms: number) => {});
      await getSignedPhotoUrl(PATH, { sleep, random: () => roll });
      expect(sleep).toHaveBeenCalledExactlyOnceWith(expected);
    }
  });

  it("reports a second refusal as the error it is, and does not ask a third time", async () => {
    h.createSignedUrl.mockResolvedValue(DB_TIMEOUT);

    const url = await getSignedPhotoUrl(PATH, { sleep: async () => {} });

    expect(url).toBeNull();
    expect(h.createSignedUrl).toHaveBeenCalledTimes(2);
    expect(h.captureException).toHaveBeenCalledOnce();
    const [error, context] = h.captureException.mock.calls[0];
    expect(String(error)).toContain("The connection to the database timed out");
    expect(context.tags).not.toHaveProperty(ABSORBED_RETRY_TAG.key);
  });

  it("does not ask again for a refusal that asking again cannot change", async () => {
    for (const answer of [
      refusal(400, "Object not found"),
      refusal(403, "new row violates row-level security policy"),
      // No status at all: supabase-js could not tell what happened, so this
      // cannot claim the next call would go differently.
      refusal(undefined, "fetch failed"),
    ]) {
      h.createSignedUrl.mockReset().mockResolvedValue(answer);
      h.captureException.mockReset();
      const sleep = vi.fn(async (_ms: number) => {});

      const url = await getSignedPhotoUrl(PATH, { sleep });

      expect(url).toBeNull();
      expect(h.createSignedUrl).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
      expect(h.captureException).toHaveBeenCalledOnce();
    }
    expect(h.captureMessage).not.toHaveBeenCalled();
  });
});

describe("firstNursePhotoUrl", () => {
  let logged: unknown[][];
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // stubEnv, not an assignment restored by hand: assigning a saved
    // `undefined` back would leave the key set to the string "undefined".
    vi.stubEnv("SUPABASE_SECRET_KEY", "test-secret-key-for-photo-tokens");
    logged = [];
    h.createSignedUrl.mockReset();
    errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation((...args: unknown[]) => {
        logged.push(args);
      });
  });

  afterEach(() => {
    errorSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it("is the stable photo route address of the first photo, with no call to Storage", () => {
    const url = firstNursePhotoUrl([PATH, "someone/second.jpg"]);
    expect(url).toMatch(/^\/api\/nurse-photo\/[A-Za-z0-9_-]+$/);
    expect(h.createSignedUrl).not.toHaveBeenCalled();
    expect(logged).toEqual([]);
  });

  it("is null for a nurse with no photo", () => {
    expect(firstNursePhotoUrl([])).toBeNull();
    expect(logged).toEqual([]);
  });

  it("is null, and says so in the log, when the address cannot be built", () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", undefined);
    expect(firstNursePhotoUrl([PATH])).toBeNull();
    expect(logged).toHaveLength(1);
    expect(String(logged[0][0])).toContain(PATH);
  });
});

/**
 * A page a visitor reads never signs a photo while it renders.
 *
 * #877 moved the directory cards to the stable `/api/nurse-photo` address and
 * left the public profile page signing for itself. On 2026-11-20 one refused
 * signing call held that page for about four seconds and rendered it without
 * its photo (NURSEDEX-SITE-1E), and every render before that had put a fresh
 * token in the markup, which is a new cache key each time (#871).
 *
 * The callers that remain each need a real signed link and are listed with
 * the reason. A new caller fails here until it is added with one.
 */
describe("who may sign a nurse photo", () => {
  const SRC = join(__dirname, "..", "..");
  const SIGNER = /\bgetSignedPhotoUrls?\b/;
  const ALLOWED: Record<string, string> = {
    "lib/profile/photos.ts": "defines the signer",
    "app/api/nurse-photo/[token]/route.ts":
      "the one place a visitor's photo is signed, behind the cache",
    "app/(dashboard)/dashboard/edit/page.tsx":
      "a nurse's own photos, shown to her before the profile is public",
    "app/(dashboard)/dashboard/onboarding/page.tsx":
      "a nurse's own photos, shown to her before the profile is public",
    "app/(dashboard)/dashboard/preview/page.tsx":
      "a nurse's own preview of an unpublished profile",
  };

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
        ? [path]
        : [];
    });
  }

  it("is only the callers listed here", () => {
    const callers = sourceFiles(SRC)
      .filter((path) => SIGNER.test(readFileSync(path, "utf8")))
      .map((path) => relative(SRC, path))
      .sort();
    expect(callers).toEqual(Object.keys(ALLOWED).sort());
  });
});
