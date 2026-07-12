// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { unwatchedSideEffects } from "../../test/side-effect-imports";

// Issue #681. The admin server actions have had a boundary suite since #493, and
// the mutation gate (#642) proves those guards can fail. The MEMBER-facing server
// actions had neither.
//
// They authenticate with `getCurrentUser()` and refuse a null caller by returning
// an error, and the mutation gate deliberately skipped getCurrentUser outside API
// routes. Its reasoning was written for pages, where getCurrentUser refuses nobody
// and only decides what renders. A server action is not a page: it is a publicly
// callable POST endpoint, and there getCurrentUser IS the authentication.
//
// So when #681 pointed the gate at these files, all ten guards survived: the sign
// in check on revealing a nurse, saving a nurse, writing a review, asking for a
// review's removal, starting a Stripe checkout, opening the billing portal and
// finishing family onboarding could each be deleted and NO test would notice.
//
// This suite is what makes them fail. It runs the real actions against a mocked
// session with no caller, and asserts two things per action: the refusal is
// returned, and nothing is written. Remove a guard and both go wrong at once.
//
// Read it as the negative direction only. The happy paths are covered by each
// action's own tests; what was missing everywhere was proof that a stranger is
// turned away.

const h = vi.hoisted(() => {
  const state = {
    // The row getCurrentUser reads for the caller. null = signed out.
    user: null as Record<string, unknown> | null,
  };

  // Every mutating path a refused caller must never reach. expectNoSideEffects
  // walks this object rather than naming the spies one by one, so a side effect
  // added here is asserted on automatically instead of waiting to be added to
  // each test as well.
  const writes = {
    update: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    upsert: vi.fn(),
    rpc: vi.fn(),
    sendNewReviewEmail: vi.fn(),
    // Spied under the name the action IMPORTS, so the completeness check below
    // can see it. Reaching for Stripe at all means the caller got past the guard.
    getStripe: vi.fn(),
    stripeCheckoutCreate: vi.fn(),
    stripePortalCreate: vi.fn(),
  };

  // The mock has to be generous, not thin. A THIN mock makes a guardless action
  // crash on the first unmocked call, and the suite then goes red on a TypeError
  // rather than on an assertion. The mutation gate scores that "weak" and it is
  // right to: the test would go red with its assertion DELETED too, so the
  // assertion is not what is protecting the guard. So every table an unguarded
  // action would reach answers plausibly, and the action runs all the way to a
  // wrong ANSWER, which is what the assertions below catch.
  //
  // The reveals row is the sharpest example. hasRevealedNurse asks "has this
  // caller revealed this nurse", and with its guard gone a stranger would be
  // told YES. If the table answered "no row" the function would return false
  // either way and the guard would look protected while protecting nothing.
  const FAR_FUTURE = "2099-01-01T00:00:00.000Z";
  const rowFor = (table: string): unknown => {
    if (table === "users") return state.user;
    if (table === "reveals") return { access_expires_at: FAR_FUTURE };
    if (table === "reviews") {
      return { id: "row", reviewer_user_id: "someone", status: "pending" };
    }
    if (table === "family_profiles") return { zip_code: "11779" };
    if (table === "subscriptions") {
      return { stripe_customer_id: "cus_x", status: "active" };
    }
    return null;
  };

  function builder(table: string) {
    const row = rowFor(table);
    const b: Record<string, unknown> = {};
    const chain = () => b;
    for (const m of [
      "select",
      "eq",
      "in",
      "is",
      "gt",
      "gte",
      "lt",
      "lte",
      "order",
      "limit",
    ]) {
      b[m] = chain;
    }
    b.single = () => Promise.resolve({ data: row, error: null });
    b.maybeSingle = () => Promise.resolve({ data: row, error: null });
    // Awaiting the builder itself (a list query) resolves to rows.
    (b as { then?: unknown }).then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(resolve({ data: row ? [row] : [], error: null }));

    b.insert = (...a: unknown[]) => {
      writes.insert(...a);
      return b;
    };
    b.update = (...a: unknown[]) => {
      writes.update(...a);
      return b;
    };
    b.upsert = (...a: unknown[]) => {
      writes.upsert(...a);
      return b;
    };
    b.delete = (...a: unknown[]) => {
      writes.delete(...a);
      return b;
    };
    return b;
  }

  const client = () => ({
    from: (table: string) => builder(table),
    rpc: (...a: unknown[]) => {
      writes.rpc(...a);
      return Promise.resolve({ data: null, error: null });
    },
    auth: {
      getUser: () =>
        Promise.resolve({
          data: { user: state.user ? { id: state.user.id } : null },
        }),
    },
  });

  return { state, writes, client };
});

vi.mock("next/navigation", () => ({
  // Mirror the real redirect, which throws NEXT_REDIRECT to halt the action.
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// after() runs inline, so a dropped guard really would reach the email below
// rather than being quietly deferred past the end of the test.
vi.mock("next/server", () => ({ after: (fn: () => unknown) => fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.1" }),
  cookies: async () => ({ get: () => undefined, set: () => {} }),
}));
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => h.client(),
}));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => h.client(),
}));
vi.mock("@/lib/email/send", () => ({
  sendNewReviewEmail: h.writes.sendNewReviewEmail,
}));
vi.mock("@/lib/stripe/server", () => ({
  getStripe: (...a: unknown[]) => {
    h.writes.getStripe(...a);
    return {
      checkout: { sessions: { create: h.writes.stripeCheckoutCreate } },
      billingPortal: { sessions: { create: h.writes.stripePortalCreate } },
    };
  },
}));
// A refused caller never reaches these, and leaving them real would drag a
// Turnstile call and a subscription lookup into a test about authentication.
vi.mock("@/lib/turnstile/verify", () => ({
  verifyTurnstileToken: vi.fn(async () => true),
}));
vi.mock("@/lib/subscriptions/queries", () => ({
  hasActiveFamilyAccess: vi.fn(async () => true),
}));
vi.mock("@/lib/profile/queries", () => ({
  getNurseContactInfo: vi.fn(async () => ({ email: "n@example.com" })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  // Fresh module graph per test, so React cache() inside getCurrentUser cannot
  // carry one test's caller into the next.
  vi.resetModules();
  h.state.user = null; // signed out unless a test says otherwise
});

// Real v4 UUID: Zod 4's .uuid() rejects placeholder shapes.
const NURSE_ID = "11111111-1111-4111-8111-111111111111";
const REVIEW_ID = "22222222-2222-4222-8222-222222222222";

/**
 * Assert a call was refused by a redirect to EXACTLY `lands`.
 *
 * Catch and compare rather than `rejects.toThrow`, for two reasons, both learned
 * the hard way. toThrow(string) matches a SUBSTRING, so a redirect to /dashboard
 * would satisfy an expectation of /login, and completeFamilyOnboarding really
 * does redirect a non-family caller to /dashboard on its own. And the failure
 * that toThrow raises is not serialized as an AssertionError in vitest's json
 * report, so the mutation gate could not tell the assertion apart from a crash
 * and scored this guard WEAK: red in CI, but red for the wrong reason, and red
 * just the same with the assertion deleted.
 */
async function expectRefusedTo(call: Promise<unknown>, lands: string) {
  let thrown: unknown;
  try {
    await call;
  } catch (err) {
    thrown = err;
  }
  expect((thrown as Error | undefined)?.message).toBe(`NEXT_REDIRECT:${lands}`);
}

/** Sign the caller in as `role`, or out when null. */
function setCaller(role: string | null) {
  h.state.user =
    role === null
      ? null
      : {
          id: "00000000-0000-4000-8000-000000000001",
          email: "caller@example.com",
          role,
          is_suspended: false,
          is_deleted: false,
        };
}

/** No caller touched anything that writes, sends, or charges. */
function expectNoSideEffects() {
  for (const [name, spy] of Object.entries(h.writes)) {
    expect(spy, `${name} ran for a signed-out caller`).not.toHaveBeenCalled();
  }
}

describe("a signed-out caller cannot reveal a nurse", () => {
  it("is refused, and no reveal is written", async () => {
    const { revealNurse } = await import("@/lib/reveals/actions");

    const result = await revealNurse(NURSE_ID);

    expect(result).toEqual({ success: false, error: "not_authenticated" });
    expectNoSideEffects();
  });

  it("is not told whether a nurse was revealed", async () => {
    // hasRevealedNurse decides whether the public profile renders contact info
    // or the paywall. For a stranger the answer is always no.
    const { hasRevealedNurse } = await import("@/lib/reveals/actions");

    expect(await hasRevealedNurse(NURSE_ID)).toBe(false);
  });
});

describe("a signed-out caller cannot save a nurse", () => {
  it("is refused, and no saved_nurses row is touched", async () => {
    const { toggleSavedNurse } = await import("@/lib/nurses/saves-actions");

    const result = await toggleSavedNurse(NURSE_ID);

    expect(result).toMatchObject({
      success: false,
      error: "not_authenticated",
    });
    expectNoSideEffects();
  });
});

describe("a signed-out caller cannot write or unwrite a review", () => {
  const payload = {
    nurse_user_id: NURSE_ID,
    rating: 5,
    reviewer_name: "Dana",
    text: "Wonderful with my father, always on time and kind.",
    testimonial_opt_in: false,
  };

  it("cannot submit a review, and no review is written or emailed", async () => {
    const { submitFamilyReview } = await import("@/lib/reviews/actions");

    const result = await submitFamilyReview(payload);

    expect(result).toEqual({ success: false, error: "not_authenticated" });
    expectNoSideEffects();
  });

  it("cannot edit a review", async () => {
    const { updateFamilyReview } = await import("@/lib/reviews/actions");

    const result = await updateFamilyReview(REVIEW_ID, payload);

    expect(result).toEqual({ success: false, error: "not_authenticated" });
    expectNoSideEffects();
  });

  it("cannot ask for a review's removal", async () => {
    const { requestReviewRemoval } = await import("@/lib/reviews/actions");

    const result = await requestReviewRemoval({
      review_id: REVIEW_ID,
      reason: "Not a real client",
      text: "This family never hired me and I have never met them.",
    });

    expect(result).toEqual({ success: false, error: "not_authenticated" });
    expectNoSideEffects();
  });
});

describe("a signed-out caller cannot reach Stripe", () => {
  it("cannot open a checkout session", async () => {
    const { createFamilyAccessCheckout } =
      await import("@/lib/subscriptions/actions");

    const result = await createFamilyAccessCheckout({});

    expect(result).toEqual({ error: "Not authenticated" });
    expectNoSideEffects();
  });

  it("cannot open the billing portal", async () => {
    const { getCustomerPortalUrl } =
      await import("@/lib/subscriptions/actions");

    const result = await getCustomerPortalUrl();

    expect(result).toEqual({ error: "Not authenticated" });
    expectNoSideEffects();
  });
});

describe("a signed-out caller cannot act as a family", () => {
  it("is sent to /login rather than completing onboarding", async () => {
    const { completeFamilyOnboarding } = await import("@/lib/family/actions");

    const form = new FormData();
    form.set("zip_code", "11779");
    form.set("communication_preference", "email");
    form.set("disclaimer_accepted", "on");

    // This one refuses by redirecting, so the refusal is the throw.
    await expectRefusedTo(completeFamilyOnboarding({}, form), "/login");
    expectNoSideEffects();
  });

  it("cannot change a family's contact details", async () => {
    const { updateFamilyContact } = await import("@/lib/family/actions");

    const form = new FormData();
    form.set("zip_code", "11779");
    form.set("communication_preference", "email");

    const result = await updateFamilyContact(form);

    expect(result).toEqual({ error: "Not authenticated" });
    expectNoSideEffects();
  });
});

// The other half of the boundary, and the half that was still unproven after
// #681 (#683).
//
// getCurrentUser answers WHO is calling. The line after it answers WHETHER they
// may, and in these actions nobody wrote a helper for it: it is a hand-written
// `if (user.role !== "family")`. Being a comparison rather than a call, the
// mutation gate could not see it, and this suite only ever drove a signed-OUT
// caller, so neither noticed it was there.
//
// Deleting it from revealNurse would let a NURSE reveal another nurse's contact
// details, and the whole board would still report clean. These are what make it
// fail.
describe("a signed-in NURSE is refused every family-only action", () => {
  beforeEach(() => setCaller("nurse"));

  it("cannot reveal a nurse's contact details", async () => {
    const { revealNurse } = await import("@/lib/reveals/actions");

    const result = await revealNurse(NURSE_ID);

    expect(result).toEqual({ success: false, error: "wrong_role" });
    expectNoSideEffects();
  });

  it("is never told a nurse has been revealed", async () => {
    // The mocked reveals table says YES on purpose. If it said no, this would
    // return false with the guard and without it, and the guard would look
    // protective while protecting nothing.
    const { hasRevealedNurse } = await import("@/lib/reveals/actions");

    expect(await hasRevealedNurse(NURSE_ID)).toBe(false);
  });

  it("cannot save a nurse", async () => {
    const { toggleSavedNurse } = await import("@/lib/nurses/saves-actions");

    const result = await toggleSavedNurse(NURSE_ID);

    expect(result).toMatchObject({ success: false, error: "wrong_role" });
    expectNoSideEffects();
  });

  it("cannot submit a review", async () => {
    const { submitFamilyReview } = await import("@/lib/reviews/actions");

    const result = await submitFamilyReview({
      nurse_user_id: NURSE_ID,
      rating: 5,
      reviewer_name: "Dana",
      text: "Wonderful with my father, always on time and kind.",
      testimonial_opt_in: false,
    });

    expect(result).toEqual({ success: false, error: "wrong_role" });
    expectNoSideEffects();
  });

  it("cannot edit a review", async () => {
    const { updateFamilyReview } = await import("@/lib/reviews/actions");

    const result = await updateFamilyReview(REVIEW_ID, {
      nurse_user_id: NURSE_ID,
      rating: 5,
      reviewer_name: "Dana",
      text: "Wonderful with my father, always on time and kind.",
      testimonial_opt_in: false,
    });

    expect(result).toEqual({ success: false, error: "wrong_role" });
    expectNoSideEffects();
  });

  it("cannot ask for a review's removal", async () => {
    const { requestReviewRemoval } = await import("@/lib/reviews/actions");

    const result = await requestReviewRemoval({
      review_id: REVIEW_ID,
      reason: "Not a real client",
      text: "This family never hired me and I have never met them.",
    });

    expect(result).toEqual({ success: false, error: "wrong_role" });
    expectNoSideEffects();
  });

  it("cannot complete family onboarding", async () => {
    const { completeFamilyOnboarding } = await import("@/lib/family/actions");

    const form = new FormData();
    form.set("zip_code", "11779");
    form.set("communication_preference", "email");
    form.set("disclaimer_accepted", "on");

    // A nurse who reaches this form is sent to her own dashboard, not signed out.
    await expectRefusedTo(completeFamilyOnboarding({}, form), "/dashboard");
    expectNoSideEffects();
  });

  it("cannot change a family's contact details", async () => {
    const { updateFamilyContact } = await import("@/lib/family/actions");

    const form = new FormData();
    form.set("zip_code", "11779");
    form.set("communication_preference", "email");

    const result = await updateFamilyContact(form);

    expect(result).toEqual({ error: "Wrong role" });
    expectNoSideEffects();
  });
});

// #645. expectNoSideEffects walks the `writes` object, which LOOKS exhaustive and
// is a hand-maintained list. An action that reaches for something not on it (a
// Stripe cancellation, an email helper added last week) is simply unwatched: a
// refused caller could trigger it and this suite would stay green, because
// nothing is looking.
//
// So the list stops being hand-maintained. This reads what the member-facing
// actions actually import and fails if any of it is unspied. Add an email to an
// action and forget to watch it here, and this is what tells you.
describe("every side effect a member action can cause is watched", () => {
  it("has a spy for each one, so expectNoSideEffects really is exhaustive", () => {
    // Which modules this suite owns comes from the mutation gate's own routing,
    // so the suite required to catch a missing guard is the same suite required
    // to watch what that module can do.
    const gaps = unwatchedSideEffects(
      "src/lib/action-authz-boundary.test.ts",
      Object.keys(h.writes),
    );

    expect(
      gaps,
      "These modules can cause a side effect this suite is not spying on. Add a spy to `writes` and mock the module, or a refused caller could trigger it and nothing here would notice.",
    ).toEqual([]);
  });
});
