// Shared config for proxying to the eve agent. The agent owns project content
// (the durable session, design.md, and uploads in R2); the web app reaches it
// over HTTP with the shared basic credential. End users are authenticated with
// Clerk in each route before this is used.
export type EveAgentConfig = { host: string; authHeader: string }

export function eveAgentConfig(): EveAgentConfig | null {
  const host = process.env.EVE_AGENT_URL
  const username = process.env.EVE_AGENT_USERNAME
  const password = process.env.EVE_AGENT_PASSWORD
  if (!host || !username || !password) return null
  const credentials = Buffer.from(`${username}:${password}`).toString("base64")
  return { host: host.replace(/\/$/, ""), authHeader: `Basic ${credentials}` }
}

export const PROJECT_ID_RE = /^[a-z0-9_:-]{8,80}$/i
export const UPLOAD_ID_RE = /^[a-z0-9_-]{8,100}$/i

export function isAllowedUploadContentType(contentType: string) {
  return /^(image\/(png|jpe?g|webp|gif)|text\/plain|text\/markdown|application\/pdf)(;|$)/i.test(
    contentType
  )
}
