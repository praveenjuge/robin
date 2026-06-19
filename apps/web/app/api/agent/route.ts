import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

type InputResponse = { requestId: string; optionId: "approve" | "deny" }
type AgentBody = {
  projectId?: string
  message?: string
  sessionId?: string
  continuationToken?: string
  streamIndex?: number
  inputResponses?: InputResponse[]
}

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
  const endpoint = isFollowUp
    ? `${host}/eve/v1/session/${encodeURIComponent(body.sessionId!)}`
    : `${host}/eve/v1/session`
  const payload = {
    ...(body.message ? { message: body.message } : {}),
    ...(body.continuationToken
      ? { continuationToken: body.continuationToken }
      : {}),
    ...(body.inputResponses ? { inputResponses: body.inputResponses } : {}),
    clientContext: { projectId: body.projectId, clerkUserId: userId },
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
  const pendingRequests = lastEventData(
    events,
    "input.requested"
  )?.requests?.map((request: { requestId: string }) => ({
    requestId: request.requestId,
  }))
  const proposed = findToolOutput(events, "propose_design_changes")
  const committed = findToolOutput(events, "commit_design")

  return NextResponse.json({
    message: finalMessage(events),
    sessionId,
    continuationToken: startJson.continuationToken ?? body.continuationToken,
    streamIndex: events.length + (body.streamIndex ?? 0),
    pendingRequests,
    diff: proposed?.diff,
    proposedDocument: proposed?.proposedDocument,
    committedDocument: committed?.document,
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
  if (!body.message?.trim() && !body.inputResponses)
    return "A message or approval response is required."
  return null
}

function agentFailureMessage(event: Record<string, any>) {
  const message = String(event.data?.message ?? "")
  if (/rate.?limit/i.test(message)) {
    return "Robin is temporarily rate-limited. Try this turn again shortly."
  }
  return "Robin could not finish this turn. Please try again."
}

async function readNdjson(response: Response) {
  const reader = response.body?.getReader()
  if (!reader) return []
  const decoder = new TextDecoder()
  const events: Record<string, any>[] = []
  let buffer = ""

  while (events.length < 10_000) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) {
      if (!line.trim()) continue
      const event = JSON.parse(line) as Record<string, any>
      events.push(event)
      if (/^session\.(waiting|completed|failed)$/.test(event.type)) {
        await reader.cancel()
        return events
      }
    }
    if (done) break
  }
  return events
}

function finalMessage(events: Record<string, any>[]) {
  return events
    .filter((event) => event.type === "message.completed")
    .map((event) => event.data?.message)
    .filter((message): message is string => typeof message === "string")
    .at(-1)
}

function lastEventData(events: Record<string, any>[], type: string) {
  return events.filter((event) => event.type === type).at(-1)?.data
}

function findToolOutput(events: Record<string, any>[], toolName: string) {
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
    const output = value?.output ?? value?.result
    if (output && typeof output === "object") return output
  }
  return null
}

function findObject(
  value: unknown,
  match: (item: Record<string, any>) => boolean
): any {
  if (!value || typeof value !== "object") return null
  if (match(value as Record<string, any>)) return value
  for (const child of Object.values(value)) {
    const found = Array.isArray(child)
      ? child.map((item) => findObject(item, match)).find(Boolean)
      : findObject(child, match)
    if (found) return found
  }
  return null
}
