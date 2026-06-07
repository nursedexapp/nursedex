import { ImageResponse } from "next/og";
import { getPublishedPostBySlug } from "@/lib/blog/queries";

export const runtime = "nodejs";
export const alt = "NurseDex blog post";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

interface OgImageProps {
  params: { slug: string };
}

export default async function Image({ params }: OgImageProps) {
  const post = await getPublishedPostBySlug(params.slug);
  const title = post?.title ?? "The NurseDex Blog";

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          backgroundColor: "#1F5C53",
          padding: "72px 80px",
        }}
      >
        <div style={{ fontSize: 36, color: "#FBF9F7", fontWeight: 700 }}>
          NurseDex
        </div>
        <div
          style={{
            fontSize: 60,
            fontWeight: 700,
            color: "#FBF9F7",
            lineHeight: 1.15,
            maxWidth: 1000,
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 24, color: "#C4D9CF" }}>nursedex.com/blog</div>
      </div>
    ),
    { ...size },
  );
}
