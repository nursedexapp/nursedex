// @vitest-environment node
import { describe, it, expect } from "vitest";
import { parseEmbed } from "./embed";

describe("parseEmbed", () => {
  it("normalizes YouTube watch, short, and embed URLs", () => {
    const want = {
      provider: "youtube",
      embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    };
    expect(parseEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual(want);
    expect(parseEmbed("https://youtu.be/dQw4w9WgXcQ")).toEqual(want);
    expect(parseEmbed("https://www.youtube.com/embed/dQw4w9WgXcQ")).toEqual(want);
    expect(parseEmbed("https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=5")).toEqual(want);
  });

  it("normalizes Vimeo URLs", () => {
    expect(parseEmbed("https://vimeo.com/123456789")).toEqual({
      provider: "vimeo",
      embedUrl: "https://player.vimeo.com/video/123456789",
    });
    expect(parseEmbed("https://player.vimeo.com/video/123456789")).toEqual({
      provider: "vimeo",
      embedUrl: "https://player.vimeo.com/video/123456789",
    });
  });

  it("rejects unknown providers, bad schemes, and malformed ids", () => {
    expect(parseEmbed("https://evil.com/embed/abc")).toBeNull();
    expect(parseEmbed("http://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull(); // not https
    expect(parseEmbed("javascript:alert(1)")).toBeNull();
    expect(parseEmbed("https://www.youtube.com/watch?v=tooLong12345")).toBeNull();
    expect(parseEmbed("https://vimeo.com/notanumber")).toBeNull();
    expect(parseEmbed("not a url")).toBeNull();
    expect(parseEmbed(null)).toBeNull();
    // A look-alike host must not pass.
    expect(parseEmbed("https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ")).toBeNull();
  });
});
