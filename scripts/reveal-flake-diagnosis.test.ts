// @vitest-environment node
//
// #831: `reveal.family.spec.ts` flaked twice in two runs, and the failure said
// only `element(s) not found` after waiting fifteen seconds for the revealed
// email to appear.
//
// That message is true whether the reveal never happened at all or happened and
// the page had not rendered it yet, which are completely different bugs. One
// assertion covering both diagnoses neither (L11, L239).
//
// This does NOT claim the flake is cured: two observations cannot support that,
// and the cause is still unknown. It makes the next occurrence say which of the
// two it is, which is the step that has to come before a fix (L177).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SPEC = readFileSync(
  join(process.cwd(), "e2e/reveal.family.spec.ts"),
  "utf8",
);

/** Only executed lines assert anything; the comment explains the history. */
const CODE = SPEC.split("\n")
  .filter((line) => !line.trim().startsWith("//"))
  .join("\n");

describe("the family reveal spec", () => {
  // The durable record of a reveal is a spent slot, which is what the test is
  // named after. Polling it waits on the condition rather than on a fixed
  // budget (L290).
  it("checks the reveal reached the database before checking the screen", () => {
    const pollAt = CODE.indexOf("expect\n    .poll(() => slotsSpent");
    const renderAt = CODE.indexOf('getByText("e2e-reveal-nurse@nursedex.test")');
    expect(pollAt, "no poll on the durable record").toBeGreaterThan(-1);
    expect(renderAt).toBeGreaterThan(-1);
    expect(pollAt).toBeLessThan(renderAt);
  });

  // Each of the two failures has to name its own cause, or the split has
  // bought nothing: a reader would still be left guessing which one fired.
  it("gives each failure a message that names its own cause", () => {
    expect(CODE).toMatch(/never reached the database/);
    expect(CODE).toMatch(/never appeared on screen/);
  });

  it("says explicitly that a database failure is not a rendering problem", () => {
    expect(CODE).toMatch(/not a rendering/i);
  });

  // A retried click would be worse than the flake. A reveal is not idempotent:
  // clicking twice could spend two slots, and the test's whole subject is that
  // exactly one is spent (L525).
  it("does not retry the click", () => {
    const clicks = CODE.match(/reveal\.click\(\)/g) ?? [];
    expect(clicks).toHaveLength(1);
  });

  it("still asserts exactly one slot is spent, which is the point of the test", () => {
    expect(CODE).toMatch(/slotsSpent\(familyId\)\)\.toBe\(1\)/);
  });
});
