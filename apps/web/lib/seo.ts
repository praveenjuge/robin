/**
 * Centralized site metadata used across the App Router Metadata API
 * (layout metadata, OG/Twitter images, robots, sitemap, and manifest).
 */

function resolveSiteUrl(): string {
  // Explicit override takes precedence (set this to your production domain).
  const explicit = process.env.NEXT_PUBLIC_SITE_URL
  if (explicit) return explicit.replace(/\/$/, "")

  // Vercel exposes the production URL at build/runtime without a protocol.
  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  if (vercelUrl) return `https://${vercelUrl}`

  return "http://localhost:3000"
}

export const siteUrl = resolveSiteUrl()

export const siteConfig = {
  name: "Robin",
  title: "Robin — Living design memory for your projects",
  description:
    "Robin is an agent-led design memory partner. Chat to capture design decisions, review every proposed change, and keep a single living design.md your coding agents can build from.",
  url: siteUrl,
  locale: "en_US",
  keywords: [
    "Robin",
    "design memory",
    "design.md",
    "AI design assistant",
    "coding agents",
    "design system",
    "design tokens",
    "source of truth",
    "AI agents",
  ],
} as const
