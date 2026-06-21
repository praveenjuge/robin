import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import {
  eveAgentConfig,
  isAllowedUploadContentType,
  PROJECT_ID_RE,
} from "@/lib/eve-agent"

export const runtime = "nodejs"

const MAX_UPLOAD_BYTES = 25_000_000

type UploadMeta = {
  uploadId: string
  name: string
  contentType: string
  size: number
  createdAt: string
}

// The eve agent owns uploads in R2 (alongside design.md). The web app proxies
// list/create here so the browser never holds the agent credential. Each
// upload's `url` points back at this app's download route so previews stay
// same-origin (no R2 CORS needed).
function toView(projectId: string, upload: UploadMeta) {
  return {
    id: upload.uploadId,
    name: upload.name,
    contentType: upload.contentType,
    size: upload.size,
    createdAt: upload.createdAt,
    url: `/api/uploads/${encodeURIComponent(upload.uploadId)}?projectId=${encodeURIComponent(
      projectId
    )}`,
  }
}

export async function GET(request: Request) {
  const { userId } = await auth()
  if (!userId)
    return NextResponse.json({ error: "Sign in to use Robin." }, { status: 401 })

  const url = new URL(request.url)
  const projectId = url.searchParams.get("projectId") ?? ""
  if (!PROJECT_ID_RE.test(projectId))
    return NextResponse.json({ error: "Invalid project id." }, { status: 400 })

  const config = eveAgentConfig()
  if (!config)
    return NextResponse.json(
      { error: "Robin agent is not configured." },
      { status: 500 }
    )

  const target = `${config.host}/robin/v1/uploads?projectId=${encodeURIComponent(
    projectId
  )}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await fetch(target, {
      headers: { authorization: config.authHeader },
      cache: "no-store",
      signal: controller.signal,
    })
    if (!response.ok)
      return NextResponse.json(
        { error: "Robin could not list uploads." },
        { status: 502 }
      )
    const data = (await response.json()) as { uploads?: UploadMeta[] }
    return NextResponse.json({
      uploads: (data.uploads ?? []).map((upload) => toView(projectId, upload)),
    })
  } catch {
    return NextResponse.json(
      { error: "Robin could not list uploads." },
      { status: 502 }
    )
  } finally {
    clearTimeout(timeout)
  }
}

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId)
    return NextResponse.json({ error: "Sign in to use Robin." }, { status: 401 })

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 })
  }

  const projectId = String(form.get("projectId") ?? "")
  if (!PROJECT_ID_RE.test(projectId))
    return NextResponse.json({ error: "Invalid project id." }, { status: 400 })

  const file = form.get("file")
  if (!(file instanceof File))
    return NextResponse.json({ error: "A file is required." }, { status: 400 })
  if (file.size < 1 || file.size > MAX_UPLOAD_BYTES)
    return NextResponse.json(
      { error: "Files must be between 1 byte and 25 MB." },
      { status: 400 }
    )
  const contentType = file.type || "application/octet-stream"
  if (!isAllowedUploadContentType(contentType))
    return NextResponse.json(
      { error: "Only images, text, Markdown, and PDFs can be uploaded." },
      { status: 400 }
    )

  const config = eveAgentConfig()
  if (!config)
    return NextResponse.json(
      { error: "Robin agent is not configured." },
      { status: 500 }
    )

  const target = `${config.host}/robin/v1/uploads?projectId=${encodeURIComponent(
    projectId
  )}&name=${encodeURIComponent(file.name)}&contentType=${encodeURIComponent(
    contentType
  )}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)
  try {
    const response = await fetch(target, {
      method: "POST",
      headers: {
        authorization: config.authHeader,
        "content-type": contentType,
      },
      body: await file.arrayBuffer(),
      signal: controller.signal,
    })
    if (!response.ok)
      return NextResponse.json(
        { error: "Robin could not store the upload." },
        { status: 502 }
      )
    const data = (await response.json()) as { upload?: UploadMeta }
    if (!data.upload)
      return NextResponse.json(
        { error: "Robin could not store the upload." },
        { status: 502 }
      )
    return NextResponse.json({ upload: toView(projectId, data.upload) })
  } catch {
    return NextResponse.json(
      { error: "Robin could not store the upload." },
      { status: 502 }
    )
  } finally {
    clearTimeout(timeout)
  }
}
