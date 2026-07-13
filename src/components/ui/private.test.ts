// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MASK_PII, BLOCK_PII } from "./private";

/**
 * #379. PostHog session replay records the DOM. rrweb masks form INPUTS by
 * default, so what people TYPE was already safe. What it does not touch is text
 * we RENDER, and that is where the data was going: a family's revealed nurse
 * phone number, the admin panel's lists of user emails, license numbers on the
 * verification queue, all recorded in readable form into a third party.
 *
 * A class on an element is easy to delete by accident and impossible to notice
 * missing, so these tests pin the surfaces that carry PII to the class that
 * protects them. They read the files as text on purpose: rendering each of these
 * pages would need a database, and the thing worth guarding is simply "did the
 * class survive the next refactor".
 */
const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("the revealed contact card is BLOCKED, not merely masked", () => {
  const source = read("src/components/profile/NurseProfilePublic.tsx");

  it("blocks the element that holds the revealed phone number and email", () => {
    // Blocking, not masking, and the distinction is the whole point: the phone
    // number is inside href="tel:..." and the email inside href="mailto:...".
    // Session replay records attributes, so masking the visible text would leave
    // both sitting in plain sight in the link targets.
    //
    // The component references the CONSTANT, not the literal class name, which is
    // the point of having a constant: the string lives in exactly one place.
    expect(source).toContain("BLOCK_PII");
    expect(source).toContain("@/components/ui/private");
  });

  it("still renders the contact details it is protecting, so this is a real guard", () => {
    // If the contact block were ever removed, the test above would keep passing
    // against nothing. Anchor it to the data.
    expect(source).toMatch(/nurse\.contact_phone/);
    expect(source).toMatch(/nurse\.contact_email/);
  });
});

describe("surfaces that render other people's PII carry the mask", () => {
  const surfaces: Array<{ file: string; renders: string; pii: RegExp }> = [
    {
      file: "src/app/(admin)/admin/accounts/page.tsx",
      renders: "every user's email in the admin accounts list",
      pii: /\{(?:row|u)\.email\}/,
    },
    {
      file: "src/app/(admin)/admin/admins/page.tsx",
      renders: "every admin's email",
      pii: /\{u\.email\}/,
    },
    {
      file: "src/app/(admin)/admin/verifications/page.tsx",
      renders: "a nurse's email and license number in the verification queue",
      pii: /\{row\.email\}/,
    },
    {
      file: "src/app/(admin)/admin/blog/comments/page.tsx",
      renders: "every blog commenter's email",
      pii: /\{c\.author_email\}/,
    },
  ];

  for (const { file, renders, pii } of surfaces) {
    it(`masks ${renders}`, () => {
      const source = read(file);
      // The surface still renders the PII (so the test is guarding something)...
      expect(
        source,
        `${file} no longer renders the PII this test guards`,
      ).toMatch(pii);
      // ...and it carries the mask, via the shared constant.
      expect(
        source,
        `${file} renders PII without the MASK_PII class`,
      ).toContain("MASK_PII");
      expect(source).toContain("@/components/ui/private");
    });
  }
});

describe("the mask class names match what PostHog is configured to honour", () => {
  const posthogConfig = read("src/lib/posthog.ts");

  it("pins maskTextClass and blockClass to the names the components use", () => {
    // The names are PostHog's defaults, but a default is not a promise. If a
    // posthog-js release renamed them, every mask in the app would silently stop
    // working and nothing would tell us. Pinning them means this test fails first.
    expect(posthogConfig).toContain("maskTextClass");
    expect(posthogConfig).toContain("blockClass");
    expect(MASK_PII).toBe("ph-mask");
    expect(BLOCK_PII).toBe("ph-no-capture");
  });
});
