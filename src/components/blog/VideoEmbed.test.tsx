// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { VideoEmbed } from "./VideoEmbed";

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
    expect(img?.getAttribute("src")).toBe("/api/video-thumbnail/youtube/abcdefghijk");
    expect(img?.getAttribute("alt")).toBe("");
    expect(screen.getByRole("button", { name: "Play YouTube video" })).toBeInTheDocument();
  });

  it("shows no visible cookie note (decision 4)", () => {
    render(<VideoEmbed {...youtube} />);
    expect(screen.queryByText(/cookies/i)).toBeNull();
  });

  it("falls back to the plain panel when the preview cannot load", () => {
    const { container } = render(<VideoEmbed {...youtube} />);
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("button", { name: "Play YouTube video" })).toBeInTheDocument();
  });

  it("loads the player, playing, once the reader clicks", () => {
    const { container } = render(
      <VideoEmbed provider="vimeo" id="123" embedUrl="https://player.vimeo.com/video/123" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Play Vimeo video" }));
    expect(container.querySelector("iframe")?.getAttribute("src")).toBe(
      "https://player.vimeo.com/video/123?autoplay=1",
    );
  });
});
