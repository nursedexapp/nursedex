import { test, expect } from "@playwright/test";

// A visitor reading NurseDex through Google Translate (#1240). Translate takes
// every text node out of the page and puts a pair of <font> wrappers holding
// the translation where it was; PostHog recorded exactly this shape on the
// nurse whose signup crashed (NURSEDEX-SITE-19 and 1A). React still holds the
// removed text node, so on the signup page pressing "Join NurseDex", which
// puts a spinner IN FRONT OF that label, threw NotFoundError and replaced the
// page with the error screen.
//
// Run in Chromium, not the iPhone's WebKit: the crash is the DOM refusing to
// insert before a node that is not a child, which every engine does, and the
// suite installs only Chromium in CI. The unit test in
// src/lib/dom/translation-guard.test.tsx covers the removal half.
test("a machine translated signup page keeps working when the visitor presses Join", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/signup");
  const join = page.getByRole("button", { name: "Join NurseDex" });
  await expect(join).toBeEnabled();

  await page.evaluate(() => {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    const texts: Text[] = [];
    while (walker.nextNode()) texts.push(walker.currentNode as Text);
    for (const text of texts) {
      const parent = text.parentElement;
      if (!parent || !text.nodeValue?.trim()) continue;
      if (parent.closest("script, style")) continue;
      const outer = document.createElement("font");
      outer.setAttribute("style", "vertical-align: inherit;");
      const inner = document.createElement("font");
      inner.setAttribute("style", "vertical-align: inherit;");
      inner.textContent = `es: ${text.nodeValue}`;
      outer.appendChild(inner);
      parent.replaceChild(outer, text);
    }
  });
  const translatedJoin = page.getByRole("button", {
    name: "es: Join NurseDex",
  });
  await expect(translatedJoin).toBeVisible();

  // An address the browser's own check accepts (it needs no dot) and the
  // page's check refuses (it does), so the press runs our submit handler, and
  // with it the spinner, yet reaches no server. A short password would not
  // do: the field's minLength stops the browser submitting at all.
  await page.locator("input[name=email]").fill("nurse@example");
  await page.locator("input[name=password]").fill("long enough");
  await translatedJoin.click();

  await expect(
    page.getByText("Please enter a valid email address."),
  ).toBeVisible();
  // Neither error screen: src/app/error.tsx, nor global-error.tsx, which is
  // the one the nurse saw.
  await expect(page.getByText("Something went wrong")).toHaveCount(0);
  await expect(page.getByText("We hit a snag")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});
