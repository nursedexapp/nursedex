import { test, expect } from "@playwright/test";

// NURSEDEX-SITE-13: tapping Dashboard in the phone menu crashed into the root
// error boundary with React error #482 ("An unknown Component is an async
// Client Component"). Nothing on the client is async. React throws that text
// when the shell has suspended more than 100 times without a commit: a client
// side navigation out of the public section, taken while the menu sheet was
// open or closing, re-suspended the shell in a loop (about a thousand times in
// a second and a half, with no update scheduled by our code) until it threw.
//
// Measured with the menu's Dashboard link as next/link: this failed 10 of 10,
// and the unchanged product failed about 1 in 40 taps. A root loading.tsx
// stopped it but turned every notFound() and redirect() into a 200, so the
// menu's cross-section links load the page instead (MobileNav.tsx). The slow
// network below then never applies, because only client side navigations send
// the RSC header, which is the point: the looping path is not taken.

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test("a slow cross-section navigation survives taps while it loads", async ({
  page,
}) => {
  const reactErrors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && /#482|async Client Component/.test(m.text())) {
      reactErrors.push(m.text());
    }
  });

  await page.goto("/");
  await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();

  // Hold every router request for the new section, so the navigation stays
  // pending while the taps below arrive.
  await page.route("**/*", async (route) => {
    const headers = route.request().headers();
    if (headers["rsc"] || route.request().url().includes("_rsc=")) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    await route.continue();
  });

  await page.getByRole("button", { name: "Open menu" }).click();
  await page
    .getByRole("dialog")
    .getByRole("link", { name: "Dashboard" })
    .click();

  // Nothing on screen says the tap worked, so an impatient person opens the
  // menu again and leaves it open while the dashboard loads. That open menu is
  // what set the loop off. On a client side navigation the old page is still
  // showing once the menu has closed, so the button is there to tap; on a page
  // load the old page is going away and there is nothing to tap.
  const menu = page.getByRole("button", { name: "Open menu" });
  await page
    .getByRole("dialog")
    .waitFor({ state: "hidden", timeout: 5000 })
    .catch(() => {});
  if (await menu.isVisible()) {
    await menu.click({ timeout: 1000 }).catch(() => {});
  }

  // An admin's dashboard hands them on to /admin. Wait for that or for the
  // crash, whichever comes first, so a failure names the crash rather than
  // timing out on a URL.
  const snag = page.getByRole("heading", { name: "We hit a snag" });
  await Promise.race([
    page.waitForURL(/\/admin/, { timeout: 20_000 }),
    snag.waitFor({ timeout: 20_000 }),
  ]);
  expect(reactErrors).toEqual([]);
  await expect(snag).toBeHidden();
  await expect(page).toHaveURL(/\/admin/);
});
