"use client"

import { useMemo, useState } from "react"
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

export function ProjectWorkspace({ projectId }: { projectId: string }) {
  const router = useRouter()
  const id = projectId as Id<"projects">

  const project = useQuery(api.projects.get, { projectId: id })
  const projects = useQuery(api.projects.list)
  const messages = useQuery(api.messages.list, { projectId: id })
  const uploads = useQuery(api.uploads.list, { projectId: id })

  const recordMessage = useMutation(api.messages.record)
  const saveAgentState = useMutation(api.projects.saveAgentState)
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
  const hasPending = Boolean(project?.pendingDiff)

  async function sendTurn(rawMessage: string, uploadedFiles: AgentUpload[] = []) {
    if (!project || busy) return
    const message = rawMessage.trim()
    if (!message && uploadedFiles.length === 0) return
    setBusy(true)
    setError(null)
    setDraft("")

    try {
      await recordMessage({
        projectId: project._id,
        role: "user",
        content: message,
      })
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: project._id,
          message,
          sessionId: project.eveSessionId,
          continuationToken: project.eveContinuationToken,
          streamIndex: project.eveStreamIndex,
          uploads: uploadedFiles,
        }),
      })
      const result = (await response.json()) as AgentResult & { error?: string }
      if (!response.ok) {
        throw new Error(result.error ?? "Robin could not finish the turn.")
      }
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
      await saveAgentState({
        projectId: project._id,
        eveSessionId: result.sessionId,
        eveContinuationToken: result.continuationToken,
        eveStreamIndex: result.streamIndex,
        pendingRequests: [],
        pendingDiff: "",
        proposedDocument: "",
        document: result.committedDocument,
      })
      await recordMessage({
        projectId: project._id,
        role: "assistant",
        content: result.message ?? "Approved and saved design.md.",
      })
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
      await saveAgentState({
        projectId: project._id,
        eveSessionId: result.sessionId,
        eveContinuationToken: result.continuationToken,
        eveStreamIndex: result.streamIndex,
        pendingDiff: "",
        proposedDocument: "",
        pendingRequests: [],
      })
      if (result.message) {
        await recordMessage({
          projectId: project._id,
          role: "assistant",
          content: result.message,
        })
      }
      setReviewOpen(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not discard.")
    } finally {
      setBusy(false)
    }
  }

  async function answerPendingDesign(optionId: "approve" | "deny") {
    if (
      !project?.eveSessionId ||
      !project.eveContinuationToken ||
      !project.pendingRequests?.length
    ) {
      throw new Error("Robin is not waiting for a design decision.")
    }
    const response = await fetch("/api/agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: project._id,
        sessionId: project.eveSessionId,
        continuationToken: project.eveContinuationToken,
        streamIndex: project.eveStreamIndex,
        inputResponses: project.pendingRequests.map((request) => ({
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
      new Blob([project.document], { type: "text/markdown" })
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
            messages={messages ?? []}
            onDraftChange={setDraft}
            onSubmit={sendTurn}
            onUploadFiles={handleUploadFiles}
            pending={pendingNode}
            uploading={uploading}
          />
        </section>
        <aside
          className={cn(
            "flex min-h-0 min-w-0 flex-col lg:border-r",
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
            document={project.document}
            onRemoveUpload={handleRemoveUpload}
            selectedPath={selectedPath}
            selectedUpload={selectedUpload}
          />
        </aside>
      </div>

      <ReviewChangesDialog
        busy={busy}
        diff={project.pendingDiff ?? ""}
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
