import { describe, it, expect } from "vitest";
import { normalizeLanguage, normalizeLanguageList } from "./language";

describe("normalizeLanguage", () => {
  it("title cases a one word language", () => {
    expect(normalizeLanguage("spanish")).toBe("Spanish");
    expect(normalizeLanguage("SPANISH")).toBe("Spanish");
  });

  it("title cases every word, not only the first", () => {
    expect(normalizeLanguage("haitian creole")).toBe("Haitian Creole");
    expect(normalizeLanguage("Haitian creole")).toBe("Haitian Creole");
    expect(normalizeLanguage("cape verdean creole")).toBe(
      "Cape Verdean Creole",
    );
  });

  it("leaves an already correct spelling alone", () => {
    expect(normalizeLanguage("Haitian Creole")).toBe("Haitian Creole");
    expect(normalizeLanguage("English")).toBe("English");
  });

  it("title cases across a hyphen", () => {
    expect(normalizeLanguage("serbo-croatian")).toBe("Serbo-Croatian");
  });

  it("does not capitalise after an apostrophe", () => {
    expect(normalizeLanguage("k'iche'")).toBe("K'iche'");
  });

  it("trims and collapses whitespace, so one language cannot become two options", () => {
    expect(normalizeLanguage("  haitian   creole  ")).toBe("Haitian Creole");
  });

  it("returns empty for input that is only whitespace", () => {
    expect(normalizeLanguage("   ")).toBe("");
  });
});

describe("normalizeLanguageList", () => {
  it("normalises every entry", () => {
    expect(normalizeLanguageList(["english", "haitian creole"])).toEqual([
      "English",
      "Haitian Creole",
    ]);
  });

  it("collapses spellings that normalise to the same language", () => {
    expect(
      normalizeLanguageList(["Haitian creole", "haitian Creole", "English"]),
    ).toEqual(["Haitian Creole", "English"]);
  });

  it("keeps the order the nurse entered them in", () => {
    expect(normalizeLanguageList(["spanish", "english"])).toEqual([
      "Spanish",
      "English",
    ]);
  });

  it("drops entries that normalise to nothing", () => {
    expect(normalizeLanguageList(["English", "   "])).toEqual(["English"]);
  });
});
