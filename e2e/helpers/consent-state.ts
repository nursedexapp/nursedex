import { CONSENT_STORAGE_KEY } from "../../src/lib/consent/store";

/**
 * A recent Decline, so existing specs never meet the cookie bar, which sits
 * over the bottom of the page and would cover what they click. consent.spec.ts
 * opts out with an empty storageState, because the bar is what it tests.
 *
 * Declined rather than accepted: a seeded Accept would start PostHog and
 * Sentry replay in every spec.
 */
export const CONSENT_ANSWERED = {
  cookies: [],
  origins: [
    {
      origin: "http://localhost:3000",
      localStorage: [
        {
          name: CONSENT_STORAGE_KEY,
          value: JSON.stringify({ choice: "declined", at: Date.now() }),
        },
      ],
    },
  ],
};
