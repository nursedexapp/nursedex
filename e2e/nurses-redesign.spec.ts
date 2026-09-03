import { test, expect, type ConsoleMessage, type Page } from "@playwright/test";
import { ensureUser, serviceClient, upsertUserRow } from "./helpers/provision";

/**
 * Browser checks for the redesigned directory (#778).
 *
 * These do NOT skip themselves. A spec that skips when its environment is
 * absent reports a pass, and the things checked here are exactly the ones that
 * fail silently: a hydration mismatch, a blocked resource, a colour that
 * measures fine in the theme file and lands invisible on the page.
 *
 * Run by `npm run test:e2e`, which the e2e workflow runs against a throwaway
 * local Supabase. It provisions its own nurses, because the seed carries none
 * and every check here needs a real card on the page: an empty directory would
 * satisfy every "nothing is wrong" assertion in this file.
 *
 * The fixtures are invented. Nothing here is derived from the design canvas,
 * which holds real nurses' photos, names, bios and rates from the private
 * bucket.
 */

const FIXTURE_NURSES = [
  {
    email: "e2e-redesign-complete@nursedex.test",
    first_name: "Adaeze",
    last_name: "Okonkwo",
    zip_code: "11779",
    profile: {
      credential: "rn",
      primary_care_type: "elderly",
      care_types: ["elderly"],
      years_experience: 7,
      bio: "Seven years on overnight shifts with families who need a steady hand.",
      rate_min: 32,
      rate_max: 48,
      availability_commitment: ["part_time"],
      profile_completeness: 90,
    },
  },
  {
    // Every field this card can be missing, missing at once. The absent states
    // are designed, so they have to be seen rather than assumed.
    //
    // She carries a bio and nothing else. A nurse with neither a photo nor a
    // bio is not listed at all (#732), so the barest card a family can
    // actually meet is this one: no photo, no zip, no care type, no
    // experience, no rate, no availability.
    email: "e2e-redesign-bare@nursedex.test",
    first_name: "Bev",
    last_name: "Quill",
    zip_code: null,
    profile: {
      credential: "hha",
      primary_care_type: null,
      care_types: [],
      years_experience: null,
      bio: "Still writing this.",
      rate_min: null,
      rate_max: null,
      availability_commitment: [],
      profile_completeness: 10,
    },
  },
  {
    // Verified, available, and completely empty: the 40 profiles that were
    // being shown to families (#732). She must not reach the directory, and
    // must still be reachable by her own link.
    email: "e2e-redesign-unlisted@nursedex.test",
    first_name: "Nula",
    last_name: "Vane",
    zip_code: null,
    profile: {
      credential: "hha",
      primary_care_type: null,
      care_types: [],
      years_experience: null,
      bio: null,
      rate_min: null,
      rate_max: null,
      availability_commitment: [],
      profile_completeness: 0,
    },
  },
];

test.beforeAll(async () => {
  const service = serviceClient();
  for (const nurse of FIXTURE_NURSES) {
    const id = await ensureUser(service, nurse.email, "e2e-Passw0rd!");
    await upsertUserRow(service, {
      id,
      email: nurse.email,
      role: "nurse",
      first_name: nurse.first_name,
      last_name: nurse.last_name,
      zip_code: nurse.zip_code,
      is_deleted: false,
      is_suspended: false,
    });
    const { error } = await service.from("nurse_profiles").upsert(
      {
        user_id: id,
        slug: nurse.email.split("@")[0],
        verification_status: "verified",
        is_hidden: false,
        is_available: true,
        tier: "free",
        has_photo: false,
        photos: [],
        ...nurse.profile,
      },
      { onConflict: "user_id" },
    );
    if (error) {
      throw new Error(
        `Could not provision ${nurse.email}: ${error.message}. These specs need real cards on the page.`,
      );
    }
  }
});

const WIDTHS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 1024, height: 800 },
  { name: "phone", width: 390, height: 844 },
];

/** Console noise the page does not control and does not ship to users. */
const IGNORED = [
  // The Vercel preview comment widget, blocked by our own CSP. Preview only.
  /vercel\.live/,
  // Next's dev-time fast refresh chatter.
  /\[Fast Refresh\]/,
  // React in DEVELOPMENT asks for eval() to rebuild call stacks, and the CSP
  // refuses it. Allowing unsafe-eval to silence this would weaken a real
  // security control to quieten a message that cannot occur in production,
  // where React never calls eval at all. The e2e suite runs the dev server, so
  // this appears there and nowhere a family will ever be.
  /eval\(\) is not supported in this environment/,
];

function collectConsole(page: Page): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const record = (message: ConsoleMessage) => {
    const text = message.text();
    if (IGNORED.some((pattern) => pattern.test(text))) return;
    if (message.type() === "error") errors.push(text);
    if (message.type() === "warning") warnings.push(text);
  };
  page.on("console", record);
  page.on("pageerror", (error) => errors.push(String(error)));
  return { errors, warnings };
}

/**
 * Contrast, measured from the COMPUTED colours on the rendered element, with
 * every ancestor background composited down.
 *
 * Reading the theme file would prove only what was written there. Treating a
 * semi transparent background as opaque is the specific way this measurement
 * goes wrong: a first attempt at it read a 15% alpha pill at 1.21:1, when it
 * is really 9.3:1.
 */
const CONTRAST_PROBE = `() => {
  const parse = (c) => {
    const n = (c.match(/[\\d.]+/g) ?? []).map(Number);
    return { r: n[0] ?? 0, g: n[1] ?? 0, b: n[2] ?? 0, a: n.length > 3 ? n[3] : 1 };
  };
  const over = (fg, bg) => ({
    r: fg.a * fg.r + (1 - fg.a) * bg.r,
    g: fg.a * fg.g + (1 - fg.a) * bg.g,
    b: fg.a * fg.b + (1 - fg.a) * bg.b,
    a: 1,
  });
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => {
    const la = lum(a), lb = lum(b);
    const hi = Math.max(la, lb), lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
  };
  const effectiveBg = (el) => {
    const stack = [];
    for (let n = el; n; n = n.parentElement) {
      const bg = parse(getComputedStyle(n).backgroundColor);
      if (bg.a > 0) stack.push(bg);
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = stack.length - 1; i >= 0; i--) base = over(stack[i], base);
    return base;
  };
  const out = [];
  // The WHOLE main region, not just the cards. A probe scoped to articles
  // answers only for articles: the one element on this page that fell under
  // the floor was the signup banner's link, outside every card (#778).
  for (const el of document.querySelectorAll('main *')) {
    const hasOwnText = [...el.childNodes].some(
      (n) => n.nodeType === 3 && n.textContent.trim(),
    );
    if (!hasOwnText) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const bg = effectiveBg(el);
    out.push({
      text: el.textContent.trim().slice(0, 40),
      ratio: ratio(over(parse(cs.color), bg), bg),
    });
  }
  return out;
}`;

for (const size of WIDTHS) {
  test.describe(`the directory at ${size.width} (${size.name})`, () => {
    test("loads with a clean console and real cards", async ({ page }) => {
      const console_ = collectConsole(page);
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto("/nurses");

      const cards = page.locator("article");
      // The positive control for everything below: without a card on screen,
      // every absence assertion here would pass on an empty page.
      await expect(cards.first()).toBeVisible();

      expect(console_.errors, `console errors at ${size.width}`).toEqual([]);
      // A blocked resource surfaces as a CSP refusal rather than a throw.
      expect(
        console_.warnings.filter((w) => /Content Security Policy/i.test(w)),
        `CSP refusals at ${size.width}`,
      ).toEqual([]);
    });

    test("never scrolls sideways", async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto("/nurses");
      await expect(page.locator("article").first()).toBeVisible();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow, "the page scrolls horizontally").toBeLessThanOrEqual(1);
    });

    test("draws every word above the 4.5:1 text floor", async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto("/nurses");
      await expect(page.locator("article").first()).toBeVisible();

      // Invoked, not merely named. page.evaluate() treats a string as an
      // expression, so handing it "() => {...}" yields a function object and
      // the probe never runs. The count assertion below is what turned that
      // into a failure rather than a green "no contrast problems found".
      const measured = (await page.evaluate(`(${CONTRAST_PROBE})()`)) as {
        text: string;
        ratio: number;
      }[];

      // A probe that found nothing, or almost nothing, would report perfect
      // contrast. The floor is set against a MIS-SCOPED probe (a selector that
      // matches nothing returns zero), not against the size of the fixture:
      // this page carries two nurses here and around a hundred in production,
      // so a threshold tuned to the real page would fail on the test one.
      expect(
        measured.length,
        "too little measurable text; the probe is probably scoped wrong",
      ).toBeGreaterThan(10);

      const failures = measured
        .filter((m) => m.ratio < 4.5)
        .map((m) => `${m.ratio.toFixed(2)}:1  ${m.text}`);
      expect(failures, `below the text floor at ${size.width}`).toEqual([]);
    });
  });
}

test.describe("the absent states", () => {
  // Every field on this card is missing on some real nurse, so each absent
  // state is designed. Asserted on the page, not only in a unit test.
  test("a nurse with nothing filled in still reads as a person", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/nurses");

    const bare = page.locator("article", { hasText: "Bev Q." });
    await expect(bare).toBeVisible();
    // No photo: her initial, not an empty circle.
    await expect(bare.locator("img")).toHaveCount(0);
    await expect(bare.getByText("B", { exact: true })).toBeVisible();
    // No years on the credential line.
    await expect(bare).not.toContainText("years");
  });

  // #732, proved against a real database rather than in a unit test: an empty
  // profile is not put in front of a family, and is not deleted either.
  test("a profile with nothing on it at all is not listed", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/nurses");

    // Bev is the control: she is just as bare, but she has a bio, so the
    // absence below is about the rule rather than about an empty page.
    await expect(page.locator("article", { hasText: "Bev Q." })).toBeVisible();
    await expect(page.locator("article", { hasText: "Nula V." })).toHaveCount(
      0,
    );
  });

  test("but she is still reachable by her own link", async ({ page }) => {
    const response = await page.goto("/nurses/e2e-redesign-unlisted");
    expect(response?.status()).toBe(200);
    // Her name appears in several places on her own page, so assert the one
    // that means the page rendered as hers rather than any mention of it.
    await expect(page.getByRole("heading", { name: /Nula/ })).toBeVisible();
  });

  // The positive control for the absence above, in the same run: the nurse who
  // HAS these fields shows them.
  test("a nurse who filled everything in shows it", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/nurses");

    const complete = page.locator("article", { hasText: "Adaeze O." });
    await expect(complete).toBeVisible();
    await expect(complete).toContainText("7 years");
    await expect(complete).toContainText("Elderly Care");
  });

  // Decision D1, checked where it matters: the payload, not the markup.
  test("a logged out visitor's page source carries no rate and no bio", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const response = await page.goto("/nurses");
    const html = (await response?.text()) ?? "";

    expect(html).not.toContain("overnight shifts with families");
    expect(html).not.toContain("Okonkwo");
    // Positive control in the same fetch: the page really did render her card,
    // so the absences above are not the absence of any card at all.
    expect(html).toContain("Adaeze");
  });
});

test.describe("the filter chips", () => {
  test("are reachable by keyboard and say whether they are open", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/nurses");

    const credential = page.getByRole("button", { name: "Credential" });
    await expect(credential).toBeVisible();
    await expect(credential).toHaveAttribute("aria-expanded", "false");

    await credential.focus();
    await expect(credential).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(credential).toHaveAttribute("aria-expanded", "true");

    // Escape closes it and puts focus back where it was, explicitly, because a
    // router transition can remount the chip.
    await page.keyboard.press("Escape");
    await expect(credential).toHaveAttribute("aria-expanded", "false");
    await expect(credential).toBeFocused();
  });

  test("an applied chip says what it is filtering and offers a way out", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/nurses?credential=rn");

    // exact: the clear button's label CONTAINS the chip's own name, so a
    // substring match resolves to both and fails on strict mode.
    await expect(
      page.getByRole("button", {
        name: "Credential: Registered Nurse",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Clear Credential: Registered Nurse" }),
    ).toBeVisible();
  });

  // Location lives behind More filters, so an applied one has to be visible on
  // the row or a family arriving from the survey sees a narrowed grid with no
  // stated cause.
  test("a filter from behind More filters still shows on the row", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/nurses?zip=11779&distance=25");

    await expect(page.getByText("Location: 25 miles of 11779")).toBeVisible();
  });
});
