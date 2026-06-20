"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useMutation, useQuery } from "convex/react"
import {
  ChevronsUpDown,
  Download,
  GitBranch,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"
import { AppHeader } from "@/components/app/app-header"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { ProjectFormDialog } from "@/components/app/project-form-dialog"
import {
  Task,
  TaskContent,
  TaskItem,
  TaskItemFile,
  TaskTrigger,
} from "@/components/ai-elements/task"
import { FileExplorer } from "@/components/workspace/file-explorer"
import {
  FileViewer,
  type ProjectUpload,
} from "@/components/workspace/file-viewer"
import { ReviewChangesDialog } from "@/components/workspace/review-changes-dialog"
import { WorkspaceChat } from "@/components/workspace/workspace-chat"
import type { ChatMessage } from "@/components/workspace/workspace-chat"
import { api } from "@workspace/convex/api"
import type { Doc, Id } from "@workspace/convex/dataModel"
import { DESIGN_PATH, uploadTreePath } from "@/lib/files"

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
type AgentUpload = {
  id: string
  name: string
  contentType: string
  size: number
  url: string
}

// The eve agent owns the durable session; the browser only holds the
// serializable cursor it needs to resume it, plus the in-flight review state
// for the current proposal. Both are runtime concerns, so they live in local
// component state (mirrored to localStorage for reloads) rather than Convex.
type SessionCursor = {
  sessionId?: string
  continuationToken?: string
  streamIndex?: number
}
type PendingReview = {
  diff: string
  proposedDocument: string
  requests: { requestId: string }[]
}
type AgentSnapshot = {
  session: SessionCursor | null
  pending: PendingReview | null
}

const EMPTY_SNAPSHOT: AgentSnapshot = { session: null, pending: null }

function agentStorageKey(projectId: string) {
  return `robin:agent:${projectId}`
}

function loadSnapshot(projectId: string): AgentSnapshot {
  if (typeof window === "undefined") return EMPTY_SNAPSHOT
  try {
    const raw = window.localStorage.getItem(agentStorageKey(projectId))
    if (!raw) return EMPTY_SNAPSHOT
    const parsed = JSON.parse(raw) as Partial<AgentSnapshot>
    return {
      session: parsed.session ?? null,
      pending: parsed.pending ?? null,
    }
  } catch {
    return EMPTY_SNAPSHOT
  }
}

function cursorFromResult(result: AgentResult): SessionCursor {
  return {
    sessionId: result.sessionId,
    continuationToken: result.continuationToken,
    streamIndex: result.streamIndex,
  }
}

// Mirrors the previous Convex merge semantics: a commit clears the proposal, a
// new proposal replaces it, and any other turn leaves the current proposal
// untouched (the agent may still be parked waiting on its approval).
function nextPending(
  current: PendingReview | null,
  result: AgentResult,
  committed: boolean
): PendingReview | null {
  if (committed) return null
  if (result.diff && result.proposedDocument) {
    return {
      diff: result.diff,
      proposedDocument: result.proposedDocument,
      requests: result.pendingRequests ?? [],
    }
  }
  return current
}

export function ProjectWorkspace({ projectId }: { projectId: string }) {
  const router = useRouter()
  const id = projectId as Id<"projects">

  const project = useQuery(api.projects.get, { projectId: id })
  const projects = useQuery(api.projects.list)
  const uploads = useQuery(api.uploads.list, { projectId: id })

  const saveAgentSession = useMutation(api.projects.saveAgentSession)
  const renameProject = useMutation(api.projects.rename)
  const removeProject = useMutation(api.projects.remove)
  const generateUploadUrl = useMutation(api.uploads.generateUploadUrl)
  const createUpload = useMutation(api.uploads.create)
  const removeUpload = useMutation(api.uploads.remove)

  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [view, setView] = useState<"chat" | "files">("chat")
  const [reviewOpen, setReviewOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)

  const [agentState, setAgentState] = useState<AgentSnapshot>(() =>
    loadSnapshot(projectId)
  )
  // Cross-device recovery: when this device has no local cursor, fall back to
  // the one persisted on the project row so the same conversation resumes
  // elsewhere. Once a turn runs here, the local cursor takes over.
  const session: SessionCursor | null =
    agentState.session ??
    (project?.eveSessionId
      ? {
          sessionId: project.eveSessionId,
          continuationToken: project.eveContinuationToken,
          streamIndex: project.eveStreamIndex,
        }
      : null)
  const pending = agentState.pending

  // eve owns the durable transcript; the browser holds a render copy that is
  // hydrated by replaying the session on load and appended optimistically as
  // turns complete.
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const hydratedSessionRef = useRef<string | null>(null)

  // eve/R2 is the source of truth for design.md. The browser holds a render
  // copy: hydrated from the agent on load (covers cross-device and reloads) and
  // updated optimistically when a commit returns the approved document.
  const [designDoc, setDesignDoc] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem(
      agentStorageKey(projectId),
      JSON.stringify(agentState)
    )
  }, [projectId, agentState])

  // Hydrate design.md from the agent once the project is loaded. The page keys
  // this component on projectId, so it remounts per project and this runs once.
  // setDesignDoc only fills a still-empty copy, so a commit that lands during
  // the fetch is never clobbered by the slower read.
  const projectLoaded = Boolean(project)
  useEffect(() => {
    if (!projectLoaded) return
    let cancelled = false
    fetch(`/api/design?projectId=${encodeURIComponent(projectId)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { document?: string } | null) => {
        if (cancelled || typeof data?.document !== "string") return
        setDesignDoc((prev) => (prev === null ? data.document! : prev))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [projectLoaded, projectId])

  // Replay the session into the transcript once per session id. We only fill an
  // empty transcript so an in-flight optimistic turn is never clobbered by a
  // slower history fetch.
  const hydrateSessionId = session?.sessionId
  const hydrateStreamIndex = session?.streamIndex
  useEffect(() => {
    if (!hydrateSessionId || !hydrateStreamIndex) return
    // Already replayed this session: skip refetching on later turns (which only
    // bump the stream index). The flag is set after a successful fetch, not
    // here, so a cancelled run (e.g. Strict Mode's double-invoke or a fast
    // remount) never blocks the real fetch from completing.
    if (hydratedSessionRef.current === hydrateSessionId) return

    const params = new URLSearchParams({
      projectId,
      sessionId: hydrateSessionId,
      streamIndex: String(hydrateStreamIndex),
    })
    let cancelled = false
    fetch(`/api/agent?${params.toString()}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { messages?: ChatMessage[] } | null) => {
        if (cancelled || !data) return
        hydratedSessionRef.current = hydrateSessionId
        const next = data.messages
        if (next?.length)
          setMessages((prev) => (prev.length === 0 ? next : prev))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [hydrateSessionId, hydrateStreamIndex, projectId])

  const createProject = useMutation(api.projects.create)

  const { paths, uploadByPath } = useMemo(() => {
    const seen = new Map<string, number>()
    const map = new Map<string, ProjectUpload>()
    const uploadPaths: string[] = []
    for (const upload of uploads ?? []) {
      const path = uploadTreePath(upload.name, seen)
      map.set(path, upload)
      uploadPaths.push(path)
    }
    return { paths: [DESIGN_PATH, ...uploadPaths], uploadByPath: map }
  }, [uploads])

  const selectedUpload = selectedPath
    ? (uploadByPath.get(selectedPath) ?? null)
    : null
  const hasPending = Boolean(pending?.diff)

  function appendMessage(role: ChatMessage["role"], content: string) {
    const text = content.trim()
    if (!text) return
    setMessages((prev) => [
      ...prev,
      { id: `local-${role}-${Date.now()}-${prev.length}`, role, content: text },
    ])
  }

  // Best-effort mirror of the eve cursor onto the project row for cross-device
  // recovery. localStorage already holds it for this device, so a failure here
  // never blocks the turn.
  function persistCursor(cursor: SessionCursor) {
    if (!project || !cursor.sessionId) return
    void saveAgentSession({
      projectId: project._id,
      sessionId: cursor.sessionId,
      continuationToken: cursor.continuationToken,
      streamIndex: cursor.streamIndex,
    }).catch(() => {})
  }

  async function sendTurn(
    rawMessage: string,
    uploadedFiles: AgentUpload[] = []
  ) {
    if (!project || busy) return
    const message = rawMessage.trim()
    if (!message && uploadedFiles.length === 0) return
    setBusy(true)
    setError(null)
    setDraft("")
    appendMessage("user", message)

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: project._id,
          message,
          sessionId: session?.sessionId,
          continuationToken: session?.continuationToken,
          streamIndex: session?.streamIndex,
          uploads: uploadedFiles,
        }),
      })
      const result = (await response.json()) as AgentResult & { error?: string }
      if (!response.ok) {
        throw new Error(result.error ?? "Robin could not finish the turn.")
      }
      appendMessage("assistant", result.message ?? "")
      const committed = Boolean(result.committedDocument)
      const cursor = cursorFromResult(result)
      setAgentState({
        session: cursor,
        pending: nextPending(pending, result, committed),
      })
      persistCursor(cursor)
      if (committed && result.committedDocument) {
        setDesignDoc(result.committedDocument)
      }
      if (result.diff) setSelectedPath(DESIGN_PATH)
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
      const result = await answerPendingDesign("approve")
      if (!result.committedDocument) {
        throw new Error("Robin did not return an approved design.md.")
      }
      const cursor = cursorFromResult(result)
      setAgentState({ session: cursor, pending: null })
      persistCursor(cursor)
      setDesignDoc(result.committedDocument)
      appendMessage(
        "assistant",
        result.message ?? "Approved and saved design.md."
      )
      setReviewOpen(false)
      setSelectedPath(DESIGN_PATH)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Approval failed.")
    } finally {
      setBusy(false)
    }
  }

  async function rejectPendingDesign() {
    if (!project || busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await answerPendingDesign("deny")
      const cursor = cursorFromResult(result)
      setAgentState({ session: cursor, pending: null })
      persistCursor(cursor)
      appendMessage("assistant", result.message ?? "")
      setReviewOpen(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not discard.")
    } finally {
      setBusy(false)
    }
  }

  async function answerPendingDesign(optionId: "approve" | "deny") {
    if (
      !project ||
      !session?.sessionId ||
      !session.continuationToken ||
      !pending?.requests.length
    ) {
      throw new Error("Robin is not waiting for a design decision.")
    }
    const response = await fetch("/api/agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: project._id,
        sessionId: session.sessionId,
        continuationToken: session.continuationToken,
        streamIndex: session.streamIndex,
        inputResponses: pending.requests.map((request) => ({
          requestId: request.requestId,
          optionId,
        })),
      }),
    })
    const result = (await response.json()) as AgentResult & { error?: string }
    if (!response.ok) {
      throw new Error(result.error ?? "Robin could not apply that decision.")
    }
    return result
  }

  async function handleUploadFiles(files: FileList) {
    if (!project || uploading || busy) return
    setUploading(true)
    setError(null)
    const uploaded: AgentUpload[] = []
    try {
      for (const file of Array.from(files)) {
        const uploadUrl = await generateUploadUrl()
        const contentType = file.type || "application/octet-stream"
        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: { "content-type": contentType },
          body: file,
        })
        if (!response.ok) throw new Error(`Failed to upload ${file.name}.`)
        const { storageId } = (await response.json()) as { storageId: string }
        const upload = await createUpload({
          projectId: project._id,
          name: file.name,
          storageId: storageId as Id<"_storage">,
          contentType,
          size: file.size,
        })
        if (!upload.url) throw new Error(`Failed to prepare ${file.name}.`)
        uploaded.push({
          id: upload._id,
          name: upload.name,
          contentType: upload.contentType,
          size: upload.size,
          url: upload.url,
        })
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed.")
      return
    } finally {
      setUploading(false)
    }

    if (uploaded.length === 0) return
    const summary =
      uploaded.length === 1
        ? uploaded[0]?.name
        : `${uploaded.length} files (${uploaded.map((file) => file.name).join(", ")})`
    await sendTurn(
      `I uploaded ${summary}. Review the upload${
        uploaded.length === 1 ? "" : "s"
      } and propose updates to design.md if anything is relevant.`,
      uploaded
    )
  }

  async function handleRemoveUpload(upload: ProjectUpload) {
    if (selectedUpload?._id === upload._id) {
      setSelectedPath(null)
    }
    await removeUpload({ uploadId: upload._id })
  }

  function downloadDesign() {
    if (!project) return
    const url = URL.createObjectURL(
      new Blob([designDoc ?? ""], { type: "text/markdown" })
    )
    const link = Object.assign(document.createElement("a"), {
      href: url,
      download: "design.md",
    })
    link.click()
    URL.revokeObjectURL(url)
  }

  if (project === undefined) {
    return (
      <div className="grid h-svh place-items-center">
        <Spinner className="size-5 text-muted-foreground" />
      </div>
    )
  }

  if (project === null) {
    return (
      <div className="flex h-svh flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          This project doesn&apos;t exist or you don&apos;t have access to it.
        </p>
        <Button render={<Link href="/" />} variant="outline">
          Back to projects
        </Button>
      </div>
    )
  }

  const pendingNode = hasPending ? (
    <Task defaultOpen>
      <TaskTrigger
        icon={<GitBranch className="size-4 text-primary" />}
        title="Robin proposed changes to design.md"
      />
      <TaskContent>
        <TaskItem>
          Review the diff before it updates{" "}
          <TaskItemFile>design.md</TaskItemFile>.
        </TaskItem>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button onClick={() => setReviewOpen(true)} size="sm">
            Review changes
          </Button>
          <Button
            disabled={busy}
            onClick={approvePendingDesign}
            size="sm"
            variant="outline"
          >
            Approve
          </Button>
        </div>
      </TaskContent>
    </Task>
  ) : null

  const designToolbar = (
    <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <p className="truncate text-sm font-medium">design.md</p>
        {hasPending && <Badge variant="secondary">Pending</Badge>}
      </div>
      <div className="flex items-center gap-1">
        {hasPending && (
          <Button onClick={() => setReviewOpen(true)} size="sm">
            <GitBranch />
            Review changes
          </Button>
        )}
        <Button
          aria-label="Download design.md"
          onClick={downloadDesign}
          size="icon-sm"
          title="Download design.md"
          variant="ghost"
        >
          <Download />
        </Button>
      </div>
    </div>
  )

  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <AppHeader
        actions={
          <WorkspaceActionsMenu
            onDelete={() => setDeleteOpen(true)}
            onDownload={downloadDesign}
            onRename={() => setRenameOpen(true)}
          />
        }
      >
        <ProjectSwitcher
          current={project}
          onCreate={() => setCreateOpen(true)}
          projects={projects ?? []}
        />
      </AppHeader>

      <div className="flex shrink-0 gap-1 border-b p-2 lg:hidden">
        <Button
          className="flex-1"
          onClick={() => setView("chat")}
          size="sm"
          variant={view === "chat" ? "secondary" : "ghost"}
        >
          Chat
        </Button>
        <Button
          className="flex-1"
          onClick={() => setView("files")}
          size="sm"
          variant={view === "files" ? "secondary" : "ghost"}
        >
          Files
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[50%_20%_30%]">
        <section
          className={cn(
            "flex min-h-0 min-w-0 flex-1 flex-col lg:border-r",
            view === "files" && "hidden lg:flex"
          )}
        >
          <WorkspaceChat
            busy={busy}
            draft={draft}
            error={error}
            messages={messages}
            onDraftChange={setDraft}
            onSubmit={sendTurn}
            onUploadFiles={handleUploadFiles}
            pending={pendingNode}
            uploading={uploading}
          />
        </section>
        <aside
          className={cn(
            "flex min-h-0 min-w-0 flex-col pt-4 lg:border-r",
            "max-lg:h-64 max-lg:shrink-0",
            view === "chat" && "hidden lg:flex"
          )}
        >
          <FileExplorer
            onSelect={setSelectedPath}
            paths={paths}
            selectedPath={selectedPath}
          />
        </aside>
        <aside
          className={cn(
            "flex min-h-0 min-w-0 flex-1 flex-col",
            view === "chat" && "hidden lg:flex"
          )}
        >
          <FileViewer
            designToolbar={designToolbar}
            document={designDoc ?? ""}
            onRemoveUpload={handleRemoveUpload}
            selectedPath={selectedPath}
            selectedUpload={selectedUpload}
          />
        </aside>
      </div>

      <ReviewChangesDialog
        busy={busy}
        diff={pending?.diff ?? ""}
        onApprove={approvePendingDesign}
        onOpenChange={setReviewOpen}
        onReject={rejectPendingDesign}
        open={reviewOpen}
      />

      <ProjectFormDialog
        initialName={project.name}
        onOpenChange={setRenameOpen}
        onSubmit={async (name) => {
          await renameProject({ projectId: project._id, name })
        }}
        open={renameOpen}
        submitLabel="Save"
        title="Rename project"
      />

      <ProjectFormDialog
        onOpenChange={setCreateOpen}
        onSubmit={async (name) => {
          const newId = await createProject({ name })
          router.push(`/projects/${newId}`)
        }}
        open={createOpen}
        submitLabel="Create project"
        title="New project"
      />

      <ConfirmDialog
        confirmLabel="Delete project"
        description={
          <>
            This permanently deletes{" "}
            <span className="font-medium text-foreground">{project.name}</span>,
            its chat history, uploads, and design.md. This can&apos;t be undone.
          </>
        }
        destructive
        onConfirm={async () => {
          await removeProject({ projectId: project._id })
          router.push("/")
        }}
        onOpenChange={setDeleteOpen}
        open={deleteOpen}
        title="Delete project?"
      />
    </div>
  )
}

function ProjectSwitcher({
  current,
  projects,
  onCreate,
}: {
  current: Doc<"projects">
  projects: Doc<"projects">[]
  onCreate: () => void
}) {
  const router = useRouter()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            className="max-w-[14rem] min-w-0 justify-between gap-2"
            variant="ghost"
          />
        }
      >
        <span className="truncate font-medium">{current.name}</span>
        <ChevronsUpDown className="shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Projects</DropdownMenuLabel>
          {projects.map((project) => (
            <DropdownMenuItem
              key={project._id}
              onClick={() => {
                if (project._id !== current._id) {
                  router.push(`/projects/${project._id}`)
                }
              }}
            >
              <span className="truncate">{project.name}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onCreate}>
          <Plus />
          New project
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function WorkspaceActionsMenu({
  onRename,
  onDownload,
  onDelete,
}: {
  onRename: () => void
  onDownload: () => void
  onDelete: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label="Project actions"
            className="text-muted-foreground"
            size="icon-sm"
            variant="ghost"
          />
        }
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={onRename}>
          <Pencil />
          Rename project
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDownload}>
          <Download />
          Download design.md
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onDelete} variant="destructive">
          <Trash2 />
          Delete project
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
