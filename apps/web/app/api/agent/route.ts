import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { Client, ClientError } from "eve/client"
import type { HandleMessageStreamEvent } from "eve/client"

type InputResponse = { requestId: string; optionId: "commit" | "cancel" }
type UploadManifest = {
  id: string
  name: string
  contentType: string
  size: number
}
type AgentBody = {
  projectId?: string
  message?: string
  sessionId?: string
  continuationToken?: string
  streamIndex?: number
  inputResponses?: InputResponse[]
  uploads?: UploadManifest[]
}
type EveMessagePart =
  | { type: "text"; text: string }
  | { type: "file"; data: string; mediaType: string; filename: string }

type TranscriptMessage = {
  id: string
  role: "user" | "assistant"
  content: string
}

export const runtime = "nodejs"

// Replays the durable eve session into the chat transcript. eve is the system
// of record for the conversation and owns the event-shape logic, so cold loads
// proxy to the agent's transcript channel (agent/channels/transcript.ts), which
// rebuilds history from the durable session. Auth posture matches GET
// /api/design: a signed-in Clerk user plus a project-id format check; the agent
// re-checks its own inbound auth.
export async function GET(request: Request) {
  const { userId } = await auth()
  if (!userId)
    return NextResponse.json(
      { error: "Sign in to use Robin." },
      { status: 401 }
    )

  const url = new URL(request.url)
  const projectId = url.searchParams.get("projectId") ?? ""
  const sessionId = url.searchParams.get("sessionId") ?? ""
  const streamIndex = Number(url.searchParams.get("streamIndex") ?? "")

  if (!/^[a-z0-9_:-]{8,80}$/i.test(projectId))
    return NextResponse.json({ error: "Invalid project id." }, { status: 400 })
  if (!/^[a-z0-9:_-]{1,200}$/i.test(sessionId))
    return NextResponse.json(
      { error: "Invalid agent session." },
      { status: 400 }
    )
  // streamIndex is the event count recorded at the last turn boundary. It
  // bounds the replay so we never block waiting for a live event.
  if (
    !Number.isInteger(streamIndex) ||
    streamIndex < 1 ||
    streamIndex > 100_000
  )
    return NextResponse.json(
      { error: "Invalid stream cursor." },
      { status: 400 }
    )

  const host = process.env.EVE_AGENT_URL
  const username = process.env.EVE_AGENT_USERNAME
  const password = process.env.EVE_AGENT_PASSWORD
  if (!host || !username || !password)
    return NextResponse.json(
      { error: "Robin agent is not configured." },
      { status: 500 }
    )

  const credentials = Buffer.from(`${username}:${password}`).toString("base64")
  const target = `${host.replace(/\/$/, "")}/robin/v1/transcript?projectId=${encodeURIComponent(
    projectId
  )}&sessionId=${encodeURIComponent(sessionId)}&streamIndex=${streamIndex}`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 25_000)
  try {
    const response = await fetch(target, {
      headers: { authorization: `Basic ${credentials}` },
      cache: "no-store",
      signal: controller.signal,
    })
    if (!response.ok)
      return NextResponse.json(
        { error: "Robin could not load the conversation history." },
        { status: 502 }
      )
    const data = (await response.json()) as { messages?: TranscriptMessage[] }
    return NextResponse.json({ messages: data.messages ?? [] })
  } catch {
    return NextResponse.json(
      { error: "Robin could not load the conversation history." },
      { status: 502 }
    )
  } finally {
    clearTimeout(timeout)
  }
}

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId)
    return NextResponse.json(
      { error: "Sign in to use Robin." },
      { status: 401 }
    )

  const parsed = await request.json().catch(() => null)
  const validationError = validateBody(parsed)
  if (validationError)
    return NextResponse.json({ error: validationError }, { status: 400 })
  const body = parsed as AgentBody

  const host = process.env.EVE_AGENT_URL
  const username = process.env.EVE_AGENT_USERNAME
  const password = process.env.EVE_AGENT_PASSWORD
  if (!host || !username || !password) {
    return NextResponse.json(
      { error: "Robin agent is not configured." },
      { status: 500 }
    )
  }

  let uploads: EveMessagePart[] = []
  try {
    uploads =
      body.uploads && body.uploads.length > 0
        ? await loadUploadParts(body.uploads, {
            host,
            username,
            password,
            projectId: body.projectId ?? "",
          })
        : []
  } catch (cause) {
    return NextResponse.json(
      {
        error:
          cause instanceof Error
            ? cause.message
            : "Robin could not inspect the upload.",
      },
      { status: 400 }
    )
  }

  // The eve client owns the session lifecycle: it picks the right endpoint
  // (new session vs. follow-up), streams the NDJSON turn, tracks the
  // continuation token + stream cursor, and reconnects on transient drops.
  const client = new Client({
    host,
    auth: { basic: { username, password } },
  })
  const session = client.session({
    sessionId: body.sessionId,
    continuationToken: body.continuationToken,
    streamIndex: body.streamIndex ?? 0,
  })

  const message = buildMessage(body.message, uploads)
  const uploadsContext = body.uploads?.map(
    ({ id, name, contentType, size }) => ({ id, name, contentType, size })
  )
  try {
    const response = await session.send({
      ...(message ? { message } : {}),
      ...(body.inputResponses ? { inputResponses: body.inputResponses } : {}),
      clientContext: {
        projectId: body.projectId ?? "",
        clerkUserId: userId,
        ...(uploadsContext ? { uploads: uploadsContext } : {}),
      },
    })
    const result = await response.result()

    if (result.status === "failed") {
      return NextResponse.json(
        { error: agentFailureMessage(result.events) },
        { status: 502 }
      )
    }

    const proposed = findToolOutput(result.events, "propose_design_changes")
    const committed = findToolOutput(result.events, "commit_design")
    const { sessionId, continuationToken, streamIndex } = session.state

    return NextResponse.json({
      message: result.message,
      sessionId,
      continuationToken,
      streamIndex,
      pendingRequests: result.inputRequests.map((request) => ({
        requestId: request.requestId,
      })),
      diff: stringValue(proposed?.diff),
      proposedDocument: stringValue(proposed?.proposedDocument),
      committedDocument: stringValue(committed?.document),
    })
  } catch (cause) {
    if (cause instanceof ClientError) {
      const message = clientErrorMessage(cause)
      return NextResponse.json(
        { error: message },
        {
          status:
            cause.status >= 400 && cause.status < 600 ? cause.status : 502,
        }
      )
    }
    return NextResponse.json(
      { error: "Robin could not read the agent response." },
      { status: 502 }
    )
  }
}

function validateBody(value: unknown) {
  if (!value || typeof value !== "object") return "Invalid request body."
  const body = value as AgentBody
  if (!body.projectId || !/^[a-z0-9_:-]{8,80}$/i.test(body.projectId))
    return "Invalid project id."
  if (body.message !== undefined && typeof body.message !== "string")
    return "Invalid message."
  if ((body.message?.length ?? 0) > 4000) return "Message is too long."
  const validHandle = (handle: unknown) =>
    handle === undefined ||
    (typeof handle === "string" && /^[a-z0-9:_-]{1,200}$/i.test(handle))
  if (!validHandle(body.sessionId) || !validHandle(body.continuationToken))
    return "Invalid agent session."
  if (Boolean(body.sessionId) !== Boolean(body.continuationToken))
    return "Incomplete agent session."
  if (
    body.streamIndex !== undefined &&
    (!Number.isInteger(body.streamIndex) ||
      body.streamIndex < 0 ||
      body.streamIndex > 100_000)
  )
    return "Invalid stream cursor."
  if (body.inputResponses !== undefined) {
    if (!body.sessionId || !Array.isArray(body.inputResponses))
      return "Invalid approval response."
    if (body.inputResponses.length < 1 || body.inputResponses.length > 10)
      return "Invalid approval response."
    if (
      body.inputResponses.some(
        (response) =>
          !response ||
          typeof response.requestId !== "string" ||
          !/^[a-z0-9_-]{1,200}$/i.test(response.requestId) ||
          !["commit", "cancel"].includes(response.optionId)
      )
    )
      return "Invalid approval response."
  }
  if (body.uploads !== undefined) {
    if (!Array.isArray(body.uploads) || body.uploads.length > 5)
      return "Invalid uploads."
    if (body.uploads.some((upload) => validateUpload(upload)))
      return "Invalid uploads."
  }
  if (!body.message?.trim() && !body.inputResponses)
    return "A message or approval response is required."
  return null
}

function validateUpload(upload: unknown) {
  if (!upload || typeof upload !== "object") return true
  const item = upload as UploadManifest
  return (
    typeof item.id !== "string" ||
    !/^[a-z0-9:_-]{8,100}$/i.test(item.id) ||
    typeof item.name !== "string" ||
    item.name.length < 1 ||
    item.name.length > 120 ||
    typeof item.contentType !== "string" ||
    !isAllowedContentType(item.contentType) ||
    !Number.isInteger(item.size) ||
    item.size < 1 ||
    item.size > 25_000_000
  )
}

function agentFailureMessage(events: HandleMessageStreamEvent[]) {
  const failed = [...events]
    .reverse()
    .find(
      (event) => event.type === "turn.failed" || event.type === "session.failed"
    )
  const message =
    failed && "data" in failed && failed.data && typeof failed.data === "object"
      ? String((failed.data as { message?: unknown }).message ?? "")
      : ""
  if (/rate.?limit/i.test(message)) {
    return "Robin is temporarily rate-limited. Try this turn again shortly."
  }
  return "Robin could not finish this turn. Please try again."
}

function clientErrorMessage(error: ClientError) {
  const parsed = safeJson(error.body)
  if (parsed && typeof parsed === "object" && "error" in parsed) {
    const value = (parsed as { error?: unknown }).error
    if (typeof value === "string") return value
  }
  return "Robin agent rejected the turn."
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function findToolOutput(
  events: HandleMessageStreamEvent[],
  toolName: string
): Record<string, unknown> | null {
  for (const event of events) {
    if (event.type !== "action.result") continue
    const result = event.data.result
    if (
      result.kind === "tool-result" &&
      result.toolName === toolName &&
      result.output &&
      typeof result.output === "object"
    ) {
      return result.output as Record<string, unknown>
    }
  }
  return null
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined
}

function buildMessage(message = "", uploads: EveMessagePart[]) {
  const text = message.trim()
  if (uploads.length === 0) return text
  return [
    {
      type: "text" as const,
      text:
        text ||
        "Review the attached upload and propose updates to design.md if relevant.",
    },
    ...uploads,
  ]
}

async function loadUploadParts(
  uploads: UploadManifest[],
  config: {
    host: string
    username: string
    password: string
    projectId: string
  }
) {
  const authHeader = `Basic ${Buffer.from(
    `${config.username}:${config.password}`
  ).toString("base64")}`
  const base = config.host.replace(/\/$/, "")
  return await Promise.all(
    uploads.map(async (upload) => {
      // Read the bytes straight from the eve agent, the R2 owner, so the model
      // sees the file inline this turn. The agent also persists it, so later
      // turns can revisit it via the list_uploads / read_upload tools.
      const target = `${base}/robin/v1/uploads/${encodeURIComponent(
        upload.id
      )}?projectId=${encodeURIComponent(config.projectId)}`
      const response = await fetch(target, {
        headers: { authorization: authHeader },
        cache: "no-store",
      })
      const length = Number(response.headers.get("content-length") ?? 0)
      const type = response.headers.get("content-type") ?? upload.contentType
      if (
        !response.ok ||
        (length > 0 && length > upload.size) ||
        !isAllowedContentType(type)
      ) {
        throw new Error(`Robin could not inspect ${upload.name}.`)
      }
      const bytes = new Uint8Array(await response.arrayBuffer())
      if (bytes.byteLength > upload.size || bytes.byteLength > 25_000_000) {
        throw new Error(`Robin could not inspect ${upload.name}.`)
      }
      return {
        type: "file" as const,
        data: `data:${type};base64,${Buffer.from(bytes).toString("base64")}`,
        mediaType: type,
        filename: upload.name,
      }
    })
  )
}

function isAllowedContentType(contentType: string) {
  return /^(image\/(png|jpe?g|webp|gif)|text\/plain|text\/markdown|application\/pdf)(;|$)/i.test(
    contentType
  )
}
