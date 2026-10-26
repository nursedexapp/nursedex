// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createTranslationGuardReporter } from "./translation-guard-report";

function fakes(isTranslated = true) {
  return {
    captureMessage: vi.fn(),
    addBreadcrumb: vi.fn(),
    isTranslated: () => isTranslated,
  };
}

describe("reporting the translation guard (#1240)", () => {
  it("files one Sentry event per page however often the guard steps in", () => {
    const deps = fakes();
    const report = createTranslationGuardReporter(deps);

    report("insertBefore");
    report("removeChild");
    report("removeChild");

    expect(deps.captureMessage).toHaveBeenCalledTimes(1);
    expect(deps.addBreadcrumb).toHaveBeenCalledTimes(3);
  });

  it("files it as a warning under the tag the Slack relay leaves out", async () => {
    const deps = fakes();
    createTranslationGuardReporter(deps)("insertBefore");

    const [, context] = deps.captureMessage.mock.calls[0];
    expect(context.level).toBe("warning");
    // The relay excludes by TAG, never by level (src/lib/sentry/issues.ts),
    // so the tag this sets is the one thing standing between a translated
    // page and a page to Dan. Read it from the relay's own query.
    vi.stubEnv("SENTRY_AUTH_TOKEN", "unused");
    vi.doMock("server-only", () => ({}));
    const { NEEDS_REVIEW_QUERY } = await import("./issues");
    const [[key, value]] = Object.entries(context.tags).filter(
      ([tag]) => tag !== "page_translated",
    );
    expect(NEEDS_REVIEW_QUERY.split(" ")).toContain(`!${key}:${value}`);
  });

  it("says whether the page was translated, so another cause stands out", () => {
    const translated = fakes(true);
    const untranslated = fakes(false);
    createTranslationGuardReporter(translated)("removeChild");
    createTranslationGuardReporter(untranslated)("removeChild");

    expect(
      translated.captureMessage.mock.calls[0][1].tags.page_translated,
    ).toBe("yes");
    expect(
      untranslated.captureMessage.mock.calls[0][1].tags.page_translated,
    ).toBe("no");
  });
});

describe("telling a translated page from an untranslated one", () => {
  it("recognises Google Translate's font wrappers", async () => {
    const { pageLooksTranslated } = await import("./translation-guard-report");
    document.body.innerHTML = "<p>Join NurseDex</p>";
    expect(pageLooksTranslated()).toBe(false);

    document.body.innerHTML =
      '<p><font style="vertical-align: inherit;"><font style="vertical-align: inherit;">Unirse</font></font></p>';
    expect(pageLooksTranslated()).toBe(true);
  });
});
