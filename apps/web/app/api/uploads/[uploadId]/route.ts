import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import {
  eveAgentConfig,
  PROJECT_ID_RE,
  UPLOAD_ID_RE,
} from "@/lib/eve-agent"

export const runtime = "nodejs"

type Params = { params: Promise<{ uploadId: string }> }

// Streams an upload's bytes back to the browser for preview/download, and
// deletes an upload. Both proxy to the eve agent (the R2 owner) with the shared
// credential after the end user is authenticated with Clerk. Serving bytes
// through this same-origin route keeps image/PDF/text previews working without
// any R2 CORS configuration.
export async function GET(request: Request, { params }: Params) {
  const { userId } = await auth()
  if (!userId)
    return NextResponse.json({ error: "Sign in to use Robin." }, { status: 401 })

  const { uploadId } = await params
  const url = new URL(request.url)
  const projectId = url.searchParams.get("projectId") ?? ""
  if (!PROJECT_ID_RE.test(projectId) || !UPLOAD_ID_RE.test(uploadId))
    return NextResponse.json({ error: "Invalid request." }, { status: 400 })

  const config = eveAgentConfig()
  if (!config)
    return NextResponse.json(
      { error: "Robin agent is not configured." },
      { status: 500 }
    )

  const target = `${config.host}/robin/v1/uploads/${encodeURIComponent(
    uploadId
  )}?projectId=${encodeURIComponent(projectId)}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)
  try {
    const response = await fetch(target, {
      headers: { authorization: config.authHeader },
      cache: "no-store",
      signal: controller.signal,
    })
    if (!response.ok || !response.body)
      return NextResponse.json(
        { error: "Robin could not load the file." },
        { status: response.status === 404 ? 404 : 502 }
      )
    const headers = new Headers()
    const contentType = response.headers.get("content-type")
    const contentLength = response.headers.get("content-length")
    const disposition = response.headers.get("content-disposition")
    if (contentType) headers.set("content-type", contentType)
    if (contentLength) headers.set("content-length", contentLength)
    if (disposition) headers.set("content-disposition", disposition)
    headers.set("cache-control", "private, max-age=60")
    return new Response(response.body, { headers })
  } catch {
    return NextResponse.json(
      { error: "Robin could not load the file." },
      { status: 502 }
    )
  } finally {
    clearTimeout(timeout)
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const { userId } = await auth()
  if (!userId)
    return NextResponse.json({ error: "Sign in to use Robin." }, { status: 401 })

  const { uploadId } = await params
  const url = new URL(request.url)
  const projectId = url.searchParams.get("projectId") ?? ""
  if (!PROJECT_ID_RE.test(projectId) || !UPLOAD_ID_RE.test(uploadId))
    return NextResponse.json({ error: "Invalid request." }, { status: 400 })

  const config = eveAgentConfig()
  if (!config)
    return NextResponse.json(
      { error: "Robin agent is not configured." },
      { status: 500 }
    )

  const target = `${config.host}/robin/v1/uploads/${encodeURIComponent(
    uploadId
  )}?projectId=${encodeURIComponent(projectId)}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await fetch(target, {
      method: "DELETE",
      headers: { authorization: config.authHeader },
      signal: controller.signal,
    })
    if (!response.ok)
      return NextResponse.json(
        { error: "Robin could not delete the file." },
        { status: 502 }
      )
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json(
      { error: "Robin could not delete the file." },
      { status: 502 }
    )
  } finally {
    clearTimeout(timeout)
  }
}
