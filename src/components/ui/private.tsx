/**
 * Keeping personal data out of PostHog session replay.
 *
 * Session replay is ON (a PostHog dashboard setting, which our code cannot see,
 * which is exactly why the recording options are pinned in src/lib/posthog.ts).
 * It records the DOM. rrweb masks form INPUTS by default, so anything a nurse or
 * family TYPES is already safe. What it does not touch is text we RENDER, and
 * that is where the real data was going: a family's revealed nurse phone number,
 * the admin panel's lists of user emails, license numbers on the verification
 * queue. All of it was being recorded in readable form into a third party, while
 * the privacy policy did not so much as mention session recording (#379, #499).
 *
 * Two tools, and the difference between them matters:
 *
 * MASK_PII ("ph-mask") masks an element's TEXT. Recordings show asterisks in
 * place of the characters, and the layout survives, so the replay is still
 * useful for seeing how someone moved through the page.
 *
 * BLOCK_PII ("ph-no-capture") drops the element from the recording entirely,
 * attributes and all. Use it when the personal data is not only in the text but
 * in the markup: the revealed-contact card renders the phone number inside
 * `href="tel:..."` and the email inside `href="mailto:..."`, and masking the text
 * would leave both sitting in plain sight in the link targets. Masking is not
 * enough when the value is an attribute.
 *
 * Both names are PostHog's own defaults, restated in src/lib/posthog.ts rather
 * than assumed, so a posthog-js release that renamed them would fail a test here
 * instead of silently unmasking everyone's contact details.
 */

/** Mask this element's text in session replay. Layout is preserved. */
export const MASK_PII = "ph-mask";

/** Drop this element from session replay entirely, including its attributes. */
export const BLOCK_PII = "ph-no-capture";
