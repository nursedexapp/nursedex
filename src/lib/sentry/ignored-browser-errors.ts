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

/**
 * Frame locations that cannot be ours, matched against the URL the THROWING
 * frame was loaded from rather than against the message.
 *
 * NURSEDEX-SITE-12 arrived as `SyntaxError: Unexpected end of input` with a
 * one frame stack, `app://iab_inner_frame_ota:38:42`, from Facebook 578.0.0 on
 * an Android Galaxy A14. "iab" is the in-app browser and `app://` is the
 * scheme it serves its own injected frame from.
 *
 * This needs its own mechanism because IGNORED_BROWSER_ERRORS keys on the
 * message and that message is one WE can legitimately produce: a JSON.parse of
 * a truncated response says exactly this. Matching it by text would discard
 * real crashes. Where the throwing frame was LOADED from separates them, and
 * the message never has to.
 *
 * Sentry reads this against the LAST valid frame (`_getLastValidUrl` in
 * @sentry/core's eventFilters), which is the frame that threw. An error thrown
 * by our code but CALLED from the host app's script therefore still reports,
 * which is the side to err on (L648).
 *
 * The third slash is the whole rule. @sentry/nextjs installs
 * nextjsClientStackFrameNormalizationIntegration by default, which turns
 * `<origin>/<path>/_next/static/...` into `app:///_next/static/...`, so OUR
 * OWN frames also wear an `app:` scheme. A plain `^app://` matches those too
 * and would discard every client side crash we have, silently, while reading
 * as a filter that works. `app://` with a HOST (`iab_inner_frame_ota`) is the
 * in-app browser; `app://` with an EMPTY host is Sentry relabelling us.
 */
export const IGNORED_BROWSER_FRAME_URLS: RegExp[] = [/^app:\/\/(?!\/)/];
