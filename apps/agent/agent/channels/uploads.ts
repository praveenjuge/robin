import { DELETE, defineChannel, GET, POST } from "eve/channels"
import { httpBasic, localDev, routeAuth, vercelOidc } from "eve/channels/auth"
import {
  deleteUpload,
  isAllowedUploadContentType,
  listUploads,
  MAX_UPLOAD_BYTES,
  putUpload,
  readUpload,
  sanitizeProjectId,
  sanitizeUploadId,
} from "../lib/r2.js"

// Same inbound auth walk as the eve and design channels (loopback dev, Vercel
// OIDC for internal callers, and the shared basic credential the web proxy
// uses). The web app authenticates the end user with Clerk before it ever
// reaches here; this credential authenticates the web app to the agent.
const auth = [
  localDev(),
  vercelOidc(),
  httpBasic({
    username: process.env.EVE_AGENT_USERNAME ?? "robin-web",
    password: process.env.EVE_AGENT_PASSWORD ?? "__missing_eve_password__",
  }),
]

function readProjectId(request: Request) {
  const url = new URL(request.url)
  return sanitizeProjectId(url.searchParams.get("projectId") ?? "")
}

// Copy into a plain ArrayBuffer so the bytes are an unambiguous BodyInit
// (the SDK hands back a Uint8Array backed by ArrayBufferLike).
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  return copy
}

// Uploads are owned by the eve agent and stored in R2 alongside design.md and
// commits. The web app uploads, lists, previews, and deletes through these
// routes instead of keeping its own copy in Convex storage. The agent reads
// the same objects via the list_uploads / read_upload tools, so an upload
// stays available across every later turn, not just the turn it arrived on.
export default defineChannel({
  routes: [
    // List a project's uploads (metadata only) for the workspace file tree.
    GET("/robin/v1/uploads", async (request) => {
      const authResult = await routeAuth(request, auth)
      if (authResult instanceof Response) return authResult

      let projectId: string
      try {
        projectId = readProjectId(request)
      } catch {
        return Response.json({ error: "Invalid project id." }, { status: 400 })
      }

      try {
        const uploads = await listUploads(projectId)
        return Response.json(
          { uploads },
          { headers: { "cache-control": "no-store" } }
        )
      } catch {
        return Response.json(
          { error: "Could not list uploads." },
          { status: 502 }
        )
      }
    }),

    // Store the raw bytes of one upload. The filename and content type ride on
    // the query string; the body is the file itself.
    POST("/robin/v1/uploads", async (request) => {
      const authResult = await routeAuth(request, auth)
      if (authResult instanceof Response) return authResult

      let projectId: string
      try {
        projectId = readProjectId(request)
      } catch {
        return Response.json({ error: "Invalid project id." }, { status: 400 })
      }

      const url = new URL(request.url)
      const name = url.searchParams.get("name") ?? "file"
      const contentType =
        url.searchParams.get("contentType") ??
        request.headers.get("content-type") ??
        "application/octet-stream"

      if (!isAllowedUploadContentType(contentType)) {
        return Response.json(
          { error: "Unsupported upload type." },
          { status: 400 }
        )
      }

      const bytes = new Uint8Array(await request.arrayBuffer())
      if (bytes.byteLength < 1) {
        return Response.json({ error: "Upload is empty." }, { status: 400 })
      }
      if (bytes.byteLength > MAX_UPLOAD_BYTES) {
        return Response.json({ error: "Upload is too large." }, { status: 413 })
      }

      try {
        const upload = await putUpload(projectId, { name, contentType, bytes })
        return Response.json({ upload }, { status: 201 })
      } catch {
        return Response.json(
          { error: "Could not store upload." },
          { status: 502 }
        )
      }
    }),

    // Stream one upload's bytes back. Used both by the web preview (image, PDF,
    // text) and by the agent proxy when it builds inline file parts for a turn.
    GET("/robin/v1/uploads/:uploadId", async (request, { params }) => {
      const authResult = await routeAuth(request, auth)
      if (authResult instanceof Response) return authResult

      let projectId: string
      let uploadId: string
      try {
        projectId = readProjectId(request)
        uploadId = sanitizeUploadId(params.uploadId ?? "")
      } catch {
        return Response.json({ error: "Invalid request." }, { status: 400 })
      }

      try {
        const result = await readUpload(projectId, uploadId)
        if (!result) {
          return Response.json({ error: "Upload not found." }, { status: 404 })
        }
        return new Response(toArrayBuffer(result.bytes), {
          headers: {
            "content-type": result.meta.contentType,
            "content-length": String(result.meta.size),
            "cache-control": "private, max-age=60",
            "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(
              result.meta.name
            )}`,
          },
        })
      } catch {
        return Response.json(
          { error: "Could not read upload." },
          { status: 502 }
        )
      }
    }),

    // Delete one upload (both the bytes and the metadata sidecar).
    DELETE("/robin/v1/uploads/:uploadId", async (request, { params }) => {
      const authResult = await routeAuth(request, auth)
      if (authResult instanceof Response) return authResult

      let projectId: string
      let uploadId: string
      try {
        projectId = readProjectId(request)
        uploadId = sanitizeUploadId(params.uploadId ?? "")
      } catch {
        return Response.json({ error: "Invalid request." }, { status: 400 })
      }

      try {
        await deleteUpload(projectId, uploadId)
        return Response.json({ ok: true })
      } catch {
        return Response.json(
          { error: "Could not delete upload." },
          { status: 502 }
        )
      }
    }),
  ],
})
