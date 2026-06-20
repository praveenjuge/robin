import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

type InputResponse = { requestId: string; optionId: "approve" | "deny" }
type UploadManifest = {
  id: string
  name: string
  contentType: string
  size: number
  url: string
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
type AgentEvent = { type: string; data?: unknown; index?: number }
type InputRequestedData = { requests?: unknown[] }
type InputRequest = { requestId: string; prompt?: string }
type EveMessagePart =
  | { type: "text"; text: string }
  | { type: "file"; data: string; mediaType: string; filename: string }

export const runtime = "nodejs"

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

  const isFollowUp = Boolean(body.sessionId && body.continuationToken)
  let uploads: EveMessagePart[] = []
  try {
    uploads =
      body.uploads && body.uploads.length > 0
        ? await loadUploadParts(body.uploads)
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
  const message = buildMessage(body.message, uploads)
  const endpoint = isFollowUp
    ? `${host}/eve/v1/session/${encodeURIComponent(body.sessionId!)}`
    : `${host}/eve/v1/session`
  const payload = {
    ...(message ? { message } : {}),
    ...(body.continuationToken
      ? { continuationToken: body.continuationToken }
      : {}),
    ...(body.inputResponses ? { inputResponses: body.inputResponses } : {}),
    clientContext: {
      projectId: body.projectId,
      clerkUserId: userId,
      uploads: body.uploads?.map(({ id, name, contentType, size }) => ({
        id,
        name,
        contentType,
        size,
      })),
    },
  }
  const started = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  })
  const startJson = await started.json().catch(() => ({}))
  if (!started.ok) {
    return NextResponse.json(
      { error: startJson.error ?? "Robin agent rejected the turn." },
      { status: started.status }
    )
  }

  const sessionId = startJson.sessionId ?? body.sessionId
  const stream = await fetch(
    `${host}/eve/v1/session/${encodeURIComponent(sessionId)}/stream?startIndex=${body.streamIndex ?? 0}`,
    {
      headers: {
        authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
      },
    }
  )
  const events = stream.ok ? await readNdjson(stream) : []
  if (!stream.ok) {
    return NextResponse.json(
      { error: "Robin could not read the agent response." },
      { status: 502 }
    )
  }
  const failed = [...events]
    .reverse()
    .find(
      (event) => event.type === "turn.failed" || event.type === "session.failed"
    )
  if (failed) {
    return NextResponse.json(
      { error: agentFailureMessage(failed) },
      { status: 502 }
    )
  }
  const pendingData = lastEventData(events, "input.requested")
  const pendingRequests = toInputRequestedData(pendingData)
    ?.requests?.filter(isInputRequest)
    .map((request) => ({
      requestId: request.requestId,
    }))
  const proposed = findToolOutput(events, "propose_design_changes")
  const committed = findToolOutput(events, "commit_design")

  return NextResponse.json({
    message: finalMessage(events),
    sessionId,
    continuationToken: startJson.continuationToken ?? body.continuationToken,
    streamIndex: nextStreamIndex(events, body.streamIndex ?? 0),
    pendingRequests,
    diff: stringValue(proposed?.diff),
    proposedDocument: stringValue(proposed?.proposedDocument),
    committedDocument: stringValue(committed?.document),
  })
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
          !["approve", "deny"].includes(response.optionId)
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
    !/^[a-z0-9:_-]{8,80}$/i.test(item.id) ||
    typeof item.name !== "string" ||
    item.name.length < 1 ||
    item.name.length > 120 ||
    typeof item.contentType !== "string" ||
    !isAllowedContentType(item.contentType) ||
    !Number.isInteger(item.size) ||
    item.size < 1 ||
    item.size > 25_000_000 ||
    typeof item.url !== "string" ||
    !isTrustedConvexStorageUrl(item.url)
  )
}

function agentFailureMessage(event: AgentEvent) {
  const message =
    event.data && typeof event.data === "object"
      ? String((event.data as { message?: unknown }).message ?? "")
      : ""
  if (/rate.?limit/i.test(message)) {
    return "Robin is temporarily rate-limited. Try this turn again shortly."
  }
  return "Robin could not finish this turn. Please try again."
}

async function readNdjson(response: Response) {
  const reader = response.body?.getReader()
  if (!reader) return []
  const decoder = new TextDecoder()
  const events: AgentEvent[] = []
  let buffer = ""

  while (events.length < 10_000) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) {
      if (!line.trim()) continue
      const parsed = parseAgentEvent(line)
      if (!parsed) continue
      events.push(parsed)
      if (/^session\.(waiting|completed|failed)$/.test(parsed.type)) {
        await reader.cancel()
        return events
      }
    }
    if (done) break
  }
  return events
}

function parseAgentEvent(line: string): AgentEvent | null {
  const value: unknown = JSON.parse(line)
  if (!value || typeof value !== "object") return null
  const event = value as { type?: unknown; data?: unknown; index?: unknown }
  if (typeof event.type !== "string") return null
  return {
    type: event.type,
    data: event.data,
    index: Number.isInteger(event.index) ? event.index : undefined,
  } as AgentEvent
}

function finalMessage(events: AgentEvent[]) {
  return events
    .filter((event) => event.type === "message.completed")
    .map((event) => toMessageData(event.data)?.message)
    .filter((message): message is string => typeof message === "string")
    .at(-1)
}

function lastEventData(events: AgentEvent[], type: string) {
  return [...events].reverse().find((event) => event.type === type)?.data
}

function findToolOutput(
  events: AgentEvent[],
  toolName: string
): Record<string, unknown> | null {
  for (const event of events) {
    if (event.type !== "action.result") continue
    const value = findObject(event, (item) =>
      Boolean(
        (item.toolName === toolName ||
          item.name === toolName ||
          item.actionName === toolName) &&
        (item.output || item.result)
      )
    )
    const output = value ? (value.output ?? value.result) : null
    if (output && typeof output === "object") {
      return output as Record<string, unknown>
    }
  }
  return null
}

function isInputRequest(value: unknown): value is InputRequest {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as InputRequest).requestId === "string"
  )
}

function toInputRequestedData(value: unknown): InputRequestedData | null {
  if (!value || typeof value !== "object") return null
  const requests = (value as InputRequestedData).requests
  return requests === undefined || Array.isArray(requests)
    ? { requests }
    : null
}

function toMessageData(value: unknown): { message?: string } | null {
  if (!value || typeof value !== "object") return null
  return value as { message?: string }
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined
}

function nextStreamIndex(events: AgentEvent[], fallbackStart: number) {
  const indexed = events
    .map((event) => event.index)
    .filter((index): index is number => Number.isInteger(index))
  return indexed.length > 0
    ? Math.max(...indexed) + 1
    : fallbackStart + events.length
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

async function loadUploadParts(uploads: UploadManifest[]) {
  return await Promise.all(
    uploads.map(async (upload) => {
      const response = await fetch(upload.url, { redirect: "manual" })
      const length = Number(response.headers.get("content-length") ?? 0)
      const type = response.headers.get("content-type") ?? upload.contentType
      if (
        !response.ok ||
        response.status >= 300 ||
        response.status < 200 ||
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

function isTrustedConvexStorageUrl(value: string) {
  try {
    const url = new URL(value)
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
    if (!convexUrl || url.protocol !== "https:") return false
    return url.hostname === new URL(convexUrl).hostname
  } catch {
    return false
  }
}

function findObject(
  value: unknown,
  match: (item: Record<string, unknown>) => boolean
): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null
  if (match(value as Record<string, unknown>)) {
    return value as Record<string, unknown>
  }
  for (const child of Object.values(value)) {
    const found = Array.isArray(child)
      ? child.map((item) => findObject(item, match)).find(Boolean)
      : findObject(child, match)
    if (found) return found
  }
  return null
}
