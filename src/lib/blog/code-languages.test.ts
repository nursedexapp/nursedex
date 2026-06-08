// @vitest-environment node
import { describe, it, expect } from "vitest";
import { common, createLowlight } from "lowlight";
import { CODE_LANGUAGES } from "./code-languages";

const lowlight = createLowlight(common);

describe("CODE_LANGUAGES", () => {
  it("only offers languages the renderer can highlight", () => {
    for (const lang of CODE_LANGUAGES) {
      expect(
        lowlight.registered(lang.value),
        `"${lang.value}" is not registered in lowlight common`,
      ).toBe(true);
    }
  });

  it("has unique values", () => {
    const values = CODE_LANGUAGES.map((l) => l.value);
    expect(new Set(values).size).toBe(values.length);
  });
});
