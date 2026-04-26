import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "NurseDex: Long Island's Trusted Nurse Directory";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        backgroundColor: "#1F5C53",
        padding: "60px 80px",
        position: "relative",
      }}
    >
      {/* Decorative ring, top-right */}
      <div
        style={{
          position: "absolute",
          top: -80,
          right: -60,
          width: 320,
          height: 320,
          borderRadius: "50%",
          border: "1px solid rgba(251, 249, 247, 0.1)",
        }}
      />
      {/* Decorative ring, bottom-left */}
      <div
        style={{
          position: "absolute",
          bottom: -60,
          left: -40,
          width: 240,
          height: 240,
          borderRadius: "50%",
          border: "1px solid rgba(251, 249, 247, 0.07)",
        }}
      />

      {/* Logo */}
      <div
        style={{
          fontSize: 42,
          color: "#FBF9F7",
          fontWeight: 700,
          marginBottom: 24,
        }}
      >
        NurseDex
      </div>

      {/* Headline */}
      <div
        style={{
          fontSize: 56,
          fontWeight: 700,
          color: "#FBF9F7",
          textAlign: "center",
          lineHeight: 1.2,
          maxWidth: 800,
        }}
      >
        Find care that feels like family.
      </div>

      {/* Subheadline */}
      <div
        style={{
          fontSize: 24,
          color: "#C4D9CF",
          textAlign: "center",
          marginTop: 20,
          maxWidth: 700,
          lineHeight: 1.5,
        }}
      >
        Long Island&apos;s trusted directory for verified nurses and caregivers.
      </div>

      {/* Badge */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginTop: 40,
          borderRadius: 999,
          border: "1px solid rgba(251, 249, 247, 0.15)",
          backgroundColor: "rgba(255, 255, 255, 0.05)",
          padding: "10px 24px",
          fontSize: 18,
          color: "#C4D9CF",
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: "#A8C5B5",
          }}
        />
        Coming Soon
      </div>
    </div>,
    { ...size },
  );
}
