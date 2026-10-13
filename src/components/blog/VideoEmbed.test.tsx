// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { VideoEmbed } from "./VideoEmbed";

// Mounting the player must not reach YouTube or Vimeo from a unit test.
// happy-dom would fetch an iframe's page for real; vitest.config.ts turns that
// off (disableIframePageLoading), and the last test below proves it. happy-dom
// then logs one "Iframe page loading is disabled" error per player instead,
// which is the refusal, not a request.
afterEach(cleanup);

const youtube = {
  provider: "youtube" as const,
  id: "abcdefghijk",
  embedUrl: "https://www.youtube.com/embed/abcdefghijk",
};

describe("VideoEmbed", () => {
  it("shows the preview from NurseDex and loads nothing from the provider", () => {
    const { container } = render(<VideoEmbed {...youtube} />);
    expect(container.querySelector("iframe")).toBeNull();
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe(
      "/api/video-thumbnail/youtube/abcdefghijk",
    );
    expect(img?.getAttribute("alt")).toBe("");
    expect(
      screen.getByRole("button", { name: "Play YouTube video" }),
    ).toBeInTheDocument();
  });

  it("shows no visible cookie note (decision 4)", () => {
    render(<VideoEmbed {...youtube} />);
    expect(screen.queryByText(/cookies/i)).toBeNull();
  });

  it("falls back to the plain panel when the preview cannot load", () => {
    const { container } = render(<VideoEmbed {...youtube} />);
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Play YouTube video" }),
    ).toBeInTheDocument();
  });

  it("loads the player, playing, once the reader clicks", () => {
    const { container } = render(
      <VideoEmbed
        provider="vimeo"
        id="123"
        embedUrl="https://player.vimeo.com/video/123"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Play Vimeo video" }));
    expect(container.querySelector("iframe")?.getAttribute("src")).toBe(
      "https://player.vimeo.com/video/123?autoplay=1",
    );
  });

  it("moves focus to the player after the click, since the button is gone", () => {
    const { container } = render(<VideoEmbed {...youtube} />);
    fireEvent.click(screen.getByRole("button", { name: "Play YouTube video" }));
    expect(document.activeElement).toBe(container.querySelector("iframe"));
  });

  it("never fetches the provider's page from a unit test", () => {
    // happy-dom refuses an iframe page load synchronously, with an error
    // event, only when page loading is off; otherwise it starts a real fetch.
    const refused: string[] = [];
    const onError = (event: Event) => {
      if (event.target instanceof HTMLIFrameElement)
        refused.push(event.target.src);
    };
    document.addEventListener("error", onError, true);
    render(
      <VideoEmbed
        provider="vimeo"
        id="123"
        embedUrl="https://player.vimeo.com/video/123"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Play Vimeo video" }));
    document.removeEventListener("error", onError, true);
    expect(refused).toEqual(["https://player.vimeo.com/video/123?autoplay=1"]);
  });
});
