/**
 * Errors thrown by the host app's own injected script when our page is opened
 * inside an in-app browser (Facebook, Instagram), not by anything we wrote.
 *
 * Those apps inject a script that talks to their native layer over a bridge,
 * and it throws when the bridge is torn down. Sentry's browser integration
 * captures every uncaught error on the page and marks same-origin frames as
 * ours, so the host app's failure is filed as a NurseDex crash, alerted on by
 * the 15 minute poller, and auto-assigned High priority.
 *
 * Each entry is keyed on the NAME OF THE BRIDGE rather than on the surrounding
 * message, because the message is minified by the host app and changes between
 * its releases. `window.webkit.messageHandlers` is the iOS bridge and appears
 * nowhere in our bundle or in any script we load (Cloudflare Turnstile,
 * PostHog), so an error naming it cannot be ours.
 *
 * Sentry ships its own list for this family (an Instagram webview error, and
 * one labelled "error from Facebook Mobile browser"). Prefer adding to that
 * upstream over growing this one; see #1071.
 *
 * Evidence: NURSEDEX-SITE-5, Instagram on Android, fixed in #565.
 * NURSEDEX-SITE-Y, Facebook 516.0.0 on iOS 26.6.2, an iPhone 15 landing on a
 * paid ad, 2026-09-15.
 */
export const IGNORED_BROWSER_ERRORS: RegExp[] = [
  /window\.webkit\.messageHandlers/,
  /Java object is gone/,
];
