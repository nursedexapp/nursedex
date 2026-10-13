"use client";

import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import type { ParsedEmbed } from "@/lib/blog/embed";

/**
 * A provider video that loads only when the reader asks for it (settled design,
 * docs/design/consent-banner.html, decisions 3 and 4). Its preview image comes
 * from NurseDex's own route, so nothing is fetched from YouTube or Vimeo until
 * the click. No visible cookie note: the privacy policy carries it, and the
 * button's name says where the video plays from.
 *
 * previewSrc is the preview route's address with the server's signature
 * (src/lib/blog/video-preview-token.ts). Without one, as in the draft preview
 * that renders in the browser, it shows the plain panel: the route refuses
 * an unsigned request, so an image would only fail.
 */
export function VideoEmbed({
  provider,
  embedUrl,
  previewSrc,
}: ParsedEmbed & { previewSrc?: string }) {
  const [playing, setPlaying] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  // The play button unmounts on click, so hand focus to the player it became.
  useEffect(() => {
    if (playing) frameRef.current?.focus();
  }, [playing]);
  const name = provider === "youtube" ? "YouTube" : "Vimeo";

  return (
    <div className="bg-soft-black relative my-6 aspect-video w-full overflow-hidden rounded-lg">
      {playing ? (
        <iframe
          ref={frameRef}
          src={`${embedUrl}?autoplay=1`}
          title={`${name} video`}
          className="absolute inset-0 h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <>
          {previewSrc && !previewFailed && (
            // eslint-disable-next-line @next/next/no-img-element -- already a NurseDex route; next/image would add a second proxy hop
            <img
              src={previewSrc}
              alt=""
              loading="lazy"
              onError={() => setPreviewFailed(true)}
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label={`Play ${name} video`}
            className="absolute inset-0 flex cursor-pointer items-center justify-center"
          >
            <span className="bg-teal flex size-[72px] items-center justify-center rounded-full shadow-lg">
              <Play
                className="size-7 fill-white text-white"
                aria-hidden="true"
              />
            </span>
          </button>
        </>
      )}
    </div>
  );
}
