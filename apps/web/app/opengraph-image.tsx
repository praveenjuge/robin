import { ImageResponse } from "next/og"
import { siteConfig } from "@/lib/seo"

export const alt = siteConfig.title
export const size = {
  width: 1200,
  height: 630,
}
export const contentType = "image/png"

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "80px",
        background: "linear-gradient(135deg, #0a0a0a 0%, #1c1c22 100%)",
        color: "#fafafa",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "72px",
            height: "72px",
            borderRadius: "20px",
            background: "#c2410c",
            fontSize: "40px",
            fontWeight: 700,
          }}
        >
          R
        </div>
        <div style={{ fontSize: "40px", fontWeight: 600 }}>
          {siteConfig.name}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
        <div
          style={{
            fontSize: "72px",
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: "-0.03em",
            maxWidth: "1000px",
          }}
        >
          Grow a living design.md, one conversation at a time.
        </div>
        <div
          style={{
            fontSize: "32px",
            color: "#a1a1aa",
            maxWidth: "880px",
            lineHeight: 1.4,
          }}
        >
          An agent-led design memory partner that keeps a single source of truth
          ready for your coding agents.
        </div>
      </div>
    </div>,
    {
      ...size,
    }
  )
}
