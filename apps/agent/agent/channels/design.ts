import { defineChannel, GET } from "eve/channels"
import { httpBasic, localDev, routeAuth, vercelOidc } from "eve/channels/auth"
import { readDesignDoc, sanitizeProjectId } from "../lib/r2.js"

// Same inbound auth walk as the eve channel (agent/channels/eve.ts): loopback
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

// Reads the current design.md for a project straight from durable R2 storage.
// eve owns the document (the commit_design tool is the only writer), so the web
// app fetches it here instead of keeping a mirrored copy in Convex.
export default defineChannel({
  routes: [
    GET("/robin/v1/design", async (request) => {
      const authResult = await routeAuth(request, auth)
      if (authResult instanceof Response) return authResult

      const url = new URL(request.url)
      let projectId: string
      try {
        projectId = sanitizeProjectId(url.searchParams.get("projectId") ?? "")
      } catch {
        return Response.json({ error: "Invalid project id." }, { status: 400 })
      }

      try {
        const document = await readDesignDoc(projectId)
        return Response.json(
          { projectId, document },
          { headers: { "cache-control": "no-store" } }
        )
      } catch {
        return Response.json(
          { error: "Could not load design.md." },
          { status: 502 }
        )
      }
    }),
  ],
})
