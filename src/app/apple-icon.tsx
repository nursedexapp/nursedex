import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          paddingBottom: "6px",
          backgroundColor: "#2A7B6F",
        }}
      >
        <span
          style={{
            fontSize: "100px",
            fontWeight: 600,
            color: "#FFFFFF",
            letterSpacing: "-0.06em",
            lineHeight: 1,
            fontFamily: "Georgia, serif",
          }}
        >
          ND
        </span>
      </div>
    ),
    { ...size },
  );
}
