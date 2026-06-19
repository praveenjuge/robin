"use client"

import { useEffect, useState } from "react"
import { useAction, useMutation, useQuery } from "convex/react"
import { Bot, Check, Download, Plus, X } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation"
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message"
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input"
import { api } from "@/convex/_generated/api"
import type { Doc, Id } from "@/convex/_generated/dataModel"

type AgentResult = {
  message?: string
  sessionId?: string
  continuationToken?: string
  streamIndex?: number
  pendingRequests?: { requestId: string }[]
  diff?: string
  proposedDocument?: string
  committedDocument?: string
}
type InputResponse = { requestId: string; optionId: "approve" }

export function RobinWorkspace() {
  const projects = useQuery(api.projects.list)
  const createProject = useMutation(api.projects.create)
  const recordMessage = useMutation(api.messages.record)
  const saveAgentState = useMutation(api.projects.saveAgentState)
  const approveDesign = useAction(api.r2.approveDesign)
  const [selectedId, setSelectedId] = useState<Id<"projects"> | null>(null)
  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const project = useQuery(
    api.projects.get,
    selectedId ? { projectId: selectedId } : "skip"
  )
  const messages = useQuery(
    api.messages.list,
    selectedId ? { projectId: selectedId } : "skip"
  )

  useEffect(() => {
    if (!projects?.length) return
    if (
      !selectedId ||
      !projects.some(
        (projectItem: Doc<"projects">) => projectItem._id === selectedId
      )
    ) {
      setSelectedId(projects[0]!._id)
    }
  }, [projects, selectedId])

  async function addProject(name: string) {
    setError(null)
    try {
      const id = await createProject({ name })
      setSelectedId(id)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not create the project."
      )
      throw cause
    }
  }

  async function sendTurn(message: string, inputResponses?: InputResponse[]) {
    if (!project || busy) return
    const cleanMessage = message.trim()
    if (!cleanMessage && !inputResponses) return
    setBusy(true)
    setError(null)
    setDraft("")

    try {
      if (cleanMessage) {
        await recordMessage({
          projectId: project._id,
          role: "user",
          content: cleanMessage,
        })
      }
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: project._id,
          message: cleanMessage,
          sessionId: project.eveSessionId,
          continuationToken: project.eveContinuationToken,
          streamIndex: project.eveStreamIndex,
          inputResponses,
        }),
      })
      const result = (await response.json()) as AgentResult & { error?: string }
      if (!response.ok)
        throw new Error(result.error ?? "Robin could not finish the turn.")
      if (result.message) {
        await recordMessage({
          projectId: project._id,
          role: "assistant",
          content: result.message,
        })
      }
      const committed = Boolean(result.committedDocument)
      await saveAgentState({
        projectId: project._id,
        eveSessionId: result.sessionId,
        eveContinuationToken: result.continuationToken,
        eveStreamIndex: result.streamIndex,
        pendingRequests: result.pendingRequests ?? (committed ? [] : undefined),
        pendingDiff: result.diff ?? (committed ? "" : undefined),
        proposedDocument:
          result.proposedDocument ?? (committed ? "" : undefined),
        document: result.committedDocument,
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.")
    } finally {
      setBusy(false)
    }
  }

  async function approvePendingDesign() {
    if (!project || busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await approveDesign({ projectId: project._id })
      await recordMessage({
        projectId: project._id,
        role: "assistant",
        content: `Approved and saved design.md (${result.commitId}).`,
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Approval failed.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ProjectToolbar
        busy={busy}
        onCreate={addProject}
        onSelect={setSelectedId}
        projects={projects ?? []}
        selectedId={selectedId}
      />
      {project ? (
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px]">
          <ChatPanel
            busy={busy}
            draft={draft}
            error={error}
            messages={messages ?? []}
            onDraftChange={setDraft}
            onSubmit={(text) => sendTurn(text)}
          />
          <DocumentPanel
            busy={busy}
            onApprove={approvePendingDesign}
            project={project}
          />
        </div>
      ) : (
        <div className="grid flex-1 place-items-center p-6 text-sm text-muted-foreground">
          {projects
            ? "Create a project to start teaching Robin."
            : "Loading projects..."}
        </div>
      )}
    </div>
  )
}

function ProjectToolbar({
  busy,
  onCreate,
  onSelect,
  projects,
  selectedId,
}: {
  busy: boolean
  onCreate: (name: string) => Promise<void>
  onSelect: (id: Id<"projects">) => void
  projects: Doc<"projects">[]
  selectedId: Id<"projects"> | null
}) {
  const [isAdding, setIsAdding] = useState(false)
  const [name, setName] = useState("")
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setCreating(true)
    setCreateError(null)
    try {
      await onCreate(name)
      setName("")
      setIsAdding(false)
    } catch (cause) {
      setCreateError(
        cause instanceof Error ? cause.message : "Could not create the project."
      )
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex min-h-12 flex-wrap items-center gap-2 border-b px-4 py-2">
      <label className="sr-only" htmlFor="project-select">
        Project
      </label>
      <select
        id="project-select"
        className="h-8 min-w-48 rounded-md border bg-background px-2 text-sm"
        disabled={busy || projects.length === 0}
        onChange={(event) => onSelect(event.target.value as Id<"projects">)}
        value={selectedId ?? ""}
      >
        {projects.length === 0 && <option value="">No projects</option>}
        {projects.map(({ _id, name: projectName }) => (
          <option key={_id} value={_id}>
            {projectName}
          </option>
        ))}
      </select>
      <Button
        aria-label="Create project"
        onClick={() => setIsAdding(true)}
        size="icon-sm"
        title="Create project"
        variant="outline"
      >
        <Plus />
      </Button>
      {isAdding && (
        <form
          className="flex min-w-64 flex-1 items-center gap-2"
          onSubmit={submit}
        >
          <Input
            autoFocus
            maxLength={80}
            minLength={2}
            onChange={(event) => setName(event.target.value)}
            placeholder="Project name"
            required
            value={name}
          />
          <Button disabled={creating} size="sm" type="submit">
            Create
          </Button>
          <Button
            aria-label="Cancel"
            onClick={() => setIsAdding(false)}
            size="icon-sm"
            title="Cancel"
            type="button"
            variant="ghost"
          >
            <X />
          </Button>
          {createError && (
            <span className="text-sm text-destructive">{createError}</span>
          )}
        </form>
      )}
    </div>
  )
}

function ChatPanel({
  busy,
  draft,
  error,
  messages,
  onDraftChange,
  onSubmit,
}: {
  busy: boolean
  draft: string
  error: string | null
  messages: Doc<"messages">[]
  onDraftChange: (value: string) => void
  onSubmit: (value: string) => void
}) {
  return (
    <section className="flex min-h-[calc(100svh-6.5rem)] flex-col border-r">
      <Conversation>
        <ConversationContent>
          {messages.length === 0 && (
            <ConversationEmptyState
              description="Describe the audience, platform, visual direction, and constraints. Robin will propose a design.md diff for approval."
              icon={<Bot className="size-5" />}
              title="Teach Robin about this project"
            />
          )}
          {messages.map((message) => (
            <Message from={message.role} key={message._id}>
              <MessageContent>
                {message.role === "assistant" ? (
                  <MessageResponse>{message.content}</MessageResponse>
                ) : (
                  message.content
                )}
              </MessageContent>
            </Message>
          ))}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <div className="border-t p-3">
        <PromptInput onSubmit={({ text }) => onSubmit(text)}>
          <PromptInputTextarea
            disabled={busy}
            maxLength={4000}
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder="Describe the product, audience, tone, tokens, or constraints..."
            value={draft}
          />
          <PromptInputFooter>
            <span className="text-xs text-muted-foreground">
              Changes require approval
            </span>
            <PromptInputSubmit
              disabled={busy || !draft.trim()}
              status={busy ? "submitted" : "ready"}
            />
          </PromptInputFooter>
        </PromptInput>
        {error && <p className="pt-2 text-sm text-destructive">{error}</p>}
      </div>
    </section>
  )
}

function DocumentPanel({
  busy,
  onApprove,
  project,
}: {
  busy: boolean
  onApprove: () => void
  project: Doc<"projects">
}) {
  function download() {
    const url = URL.createObjectURL(
      new Blob([project.document], { type: "text/markdown" })
    )
    const link = Object.assign(document.createElement("a"), {
      href: url,
      download: "design.md",
    })
    link.click()
    URL.revokeObjectURL(url)
  }

  const requests = project.pendingRequests ?? []
  return (
    <aside className="flex min-h-[calc(100svh-6.5rem)] flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">design.md</h2>
          <p className="text-xs text-muted-foreground">
            {project.latestCommit
              ? `Latest commit ${project.latestCommit}`
              : "No approved commits yet"}
          </p>
        </div>
        <Button
          aria-label="Download design.md"
          onClick={download}
          size="icon-sm"
          title="Download design.md"
          variant="outline"
        >
          <Download />
        </Button>
      </div>
      {project.pendingDiff && requests.length > 0 && (
        <section className="space-y-3 border-y py-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium">Pending diff</h3>
            <Button disabled={busy} onClick={onApprove} size="sm">
              <Check />
              Approve
            </Button>
          </div>
          <pre className="max-h-72 overflow-auto bg-muted p-3 text-xs leading-5 whitespace-pre-wrap">
            {project.pendingDiff}
          </pre>
        </section>
      )}
      <pre className="min-h-0 flex-1 overflow-auto border p-3 text-xs leading-5 whitespace-pre-wrap">
        {project.document}
      </pre>
    </aside>
  )
}
