import { defineChannel, GET } from "eve/channels"
import { httpBasic, localDev, routeAuth, vercelOidc } from "eve/channels/auth"
import type { HandleMessageStreamEvent } from "eve/client"
import { sanitizeProjectId } from "../lib/r2.js"

// Same inbound auth walk as the eve, design, and uploads channels: loopback
// dev, Vercel OIDC for internal callers, and the shared basic credential the
// web proxy uses. Each custom-channel route owns its own auth, so we run the
// walk explicitly with routeAuth.
const auth = [
  localDev(),
  vercelOidc(),
  httpBasic({
    username: process.env.EVE_AGENT_USERNAME ?? "robin-web",
    password: process.env.EVE_AGENT_PASSWORD ?? "__missing_eve_password__",
  }),
]

const SESSION_ID_RE = /^[a-z0-9:_-]{1,200}$/i
const MAX_STREAM_INDEX = 100_000
const REPLAY_TIMEOUT_MS = 20_000

type TranscriptMessage = {
  id: string
  role: "user" | "assistant"
  content: string
}

// Rebuilds the chat transcript for a project's durable eve session. eve is the
// system of record for the conversation, so cold loads replay the session from
// the start here, next to the runtime, instead of re-deriving eve's event shape
// in the web tier. The web app proxies to this route (see
// apps/web/app/api/agent/route.ts GET) the same way it reads design.md and
// uploads through the design/uploads channels.
export default defineChannel({
  routes: [
    GET("/robin/v1/transcript", async (request, { getSession }) => {
      const authResult = await routeAuth(request, auth)
      if (authResult instanceof Response) return authResult

      const url = new URL(request.url)

      try {
        sanitizeProjectId(url.searchParams.get("projectId") ?? "")
      } catch {
        return Response.json({ error: "Invalid project id." }, { status: 400 })
      }

      const sessionId = url.searchParams.get("sessionId") ?? ""
      if (!SESSION_ID_RE.test(sessionId))
        return Response.json(
          { error: "Invalid agent session." },
          { status: 400 }
        )

      // streamIndex is the event count recorded at the last turn boundary. It
      // bounds the replay so we never block waiting for a live event.
      const streamIndex = Number(url.searchParams.get("streamIndex") ?? "")
      if (
        !Number.isInteger(streamIndex) ||
        streamIndex < 1 ||
        streamIndex > MAX_STREAM_INDEX
      )
        return Response.json({ error: "Invalid stream cursor." }, { status: 400 })

      let stream: ReadableStream<HandleMessageStreamEvent>
      try {
        stream = await getSession(sessionId).getEventStream({ startIndex: 0 })
      } catch {
        // A pruned or expired session (eve sessions are durable, not permanent)
        // has no transcript to replay. Treat it as empty history so the chat
        // still opens and the user can start a fresh turn.
        return Response.json({ messages: [] })
      }

      const reader = stream.getReader()
      const timeout = setTimeout(() => {
        reader.cancel().catch(() => {})
      }, REPLAY_TIMEOUT_MS)

      const messages: TranscriptMessage[] = []
      let consumed = 0
      try {
        while (consumed < streamIndex) {
          const { value: event, done } = await reader.read()
          if (done || !event) break
          consumed++
          if (event.type === "message.received") {
            const content = event.data.message.trim()
            if (content)
              messages.push({ id: `eve-${consumed}`, role: "user", content })
          } else if (
            event.type === "message.completed" &&
            event.data.finishReason !== "tool-calls" &&
            event.data.message
          ) {
            const content = event.data.message.trim()
            if (content)
              messages.push({
                id: `eve-${consumed}`,
                role: "assistant",
                content,
              })
          }
          if (
            event.type === "session.completed" ||
            event.type === "session.failed"
          )
            break
        }
        return Response.json(
          { messages },
          { headers: { "cache-control": "no-store" } }
        )
      } catch {
        return Response.json(
          { error: "Could not load the conversation history." },
          { status: 502 }
        )
      } finally {
        clearTimeout(timeout)
        reader.releaseLock()
      }
    }),
  ],
})
