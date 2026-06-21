import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

export const runtime = "nodejs"

// Fetches the current design.md from the eve agent, which owns the document in
// R2. Convex no longer mirrors it, so cold loads read through this proxy. Auth
// posture matches the POST /api/agent route: a signed-in Clerk user plus a
// project-id format check (project metadata ownership is still enforced by
// Convex when the workspace loads the project itself).
export async function GET(request: Request) {
  const { userId } = await auth()
  if (!userId)
    return NextResponse.json(
      { error: "Sign in to use Robin." },
      { status: 401 }
    )

  const url = new URL(request.url)
  const projectId = url.searchParams.get("projectId") ?? ""
  if (!/^[a-z0-9_:-]{8,80}$/i.test(projectId))
    return NextResponse.json({ error: "Invalid project id." }, { status: 400 })

  const host = process.env.EVE_AGENT_URL
  const username = process.env.EVE_AGENT_USERNAME
  const password = process.env.EVE_AGENT_PASSWORD
  if (!host || !username || !password)
    return NextResponse.json(
      { error: "Robin agent is not configured." },
      { status: 500 }
    )

  const credentials = Buffer.from(`${username}:${password}`).toString("base64")
  const target = `${host.replace(/\/$/, "")}/robin/v1/design?projectId=${encodeURIComponent(
    projectId
  )}`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await fetch(target, {
      headers: { authorization: `Basic ${credentials}` },
      cache: "no-store",
      signal: controller.signal,
    })
    if (!response.ok)
      return NextResponse.json(
        { error: "Robin could not load design.md." },
        { status: 502 }
      )
    const data = (await response.json()) as { document?: string | null }
    // null means the project has no committed design.md yet; preserve it so the
    // workspace can keep design.md out of the file tree until Robin creates one.
    return NextResponse.json({ document: data.document ?? null })
  } catch {
    return NextResponse.json(
      { error: "Robin could not load design.md." },
      { status: 502 }
    )
  } finally {
    clearTimeout(timeout)
  }
}
