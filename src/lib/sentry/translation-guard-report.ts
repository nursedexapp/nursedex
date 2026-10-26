import * as Sentry from "@sentry/nextjs";
import type { GuardedOperation } from "@/lib/dom/translation-guard";

/**
 * The tag every translation guard report carries, which the Slack relay
 * excludes (src/lib/sentry/issues.ts). The relay leaves things out by tag,
 * never by level, so this is what keeps a translated page out of Dan's alerts
 * while the report stays in Sentry to be counted.
 */
export const TRANSLATION_GUARD_TAG = { key: "dom_guard", value: "skipped" };

/** Google Translate's wrapper, the shape PostHog recorded on #1240. */
export function pageLooksTranslated(): boolean {
  return (
    document.documentElement.classList.contains("translated-ltr") ||
    document.documentElement.classList.contains("translated-rtl") ||
    document.querySelector('font[style*="vertical-align: inherit"]') !== null
  );
}

type Deps = {
  captureMessage: typeof Sentry.captureMessage;
  addBreadcrumb: typeof Sentry.addBreadcrumb;
  isTranslated: () => boolean;
};

/**
 * What the translation guard (src/lib/dom/translation-guard.ts) calls each
 * time it keeps a page alive. Every step is a breadcrumb, so a later real
 * crash on the same page shows them; the first is also one Sentry event per
 * page, so how often this happens can be read without a flood of them.
 * `page_translated` says whether Translate's wrappers were present, because a
 * report without them means something else changed the DOM under React.
 */
export function createTranslationGuardReporter(
  deps: Deps = {
    captureMessage: Sentry.captureMessage,
    addBreadcrumb: Sentry.addBreadcrumb,
    isTranslated: pageLooksTranslated,
  },
): (operation: GuardedOperation) => void {
  let reported = false;
  return (operation) => {
    deps.addBreadcrumb({
      category: "dom_guard",
      message: `Skipped a ${operation} React expected to make`,
      level: "warning",
    });
    if (reported) return;
    reported = true;
    deps.captureMessage(
      "Kept a page working after something outside React changed its DOM",
      {
        level: "warning",
        tags: {
          [TRANSLATION_GUARD_TAG.key]: TRANSLATION_GUARD_TAG.value,
          page_translated: deps.isTranslated() ? "yes" : "no",
        },
        extra: { operation },
      },
    );
  };
}
