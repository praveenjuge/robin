"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useAction, useMutation, useQuery } from "convex/react"
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
import { DesignExplorer } from "@/components/workspace/design-explorer"
import type { ProjectUpload } from "@/components/workspace/file-viewer"
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
  const approveDesign = useAction(api.r2.approveDesign)

  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedPath, setSelectedPath] = useState<string>(DESIGN_PATH)
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

  const selectedUpload = uploadByPath.get(selectedPath) ?? null
  const hasPending = Boolean(project?.pendingDiff)

  async function sendTurn(rawMessage: string) {
    if (!project || busy) return
    const message = rawMessage.trim()
    if (!message) return
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
      const result = await approveDesign({ projectId: project._id })
      await recordMessage({
        projectId: project._id,
        role: "assistant",
        content: `Approved and saved design.md (${result.commitId}).`,
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
      await saveAgentState({
        projectId: project._id,
        pendingDiff: "",
        proposedDocument: "",
        pendingRequests: [],
      })
      setReviewOpen(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not discard.")
    } finally {
      setBusy(false)
    }
  }

  async function handleUploadFiles(files: FileList) {
    if (!project) return
    setUploading(true)
    setError(null)
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
        await createUpload({
          projectId: project._id,
          name: file.name,
          storageId: storageId as Id<"_storage">,
          contentType,
          size: file.size,
        })
      }
      setView("files")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed.")
    } finally {
      setUploading(false)
    }
  }

  async function handleRemoveUpload(upload: ProjectUpload) {
    if (selectedPath !== DESIGN_PATH && selectedUpload?._id === upload._id) {
      setSelectedPath(DESIGN_PATH)
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

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(380px,40%)]">
        <section
          className={cn(
            "flex min-h-0 min-w-0 flex-col lg:border-r",
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
            pending={pendingNode}
          />
        </section>
        <aside
          className={cn(
            "flex min-h-0 min-w-0 flex-col",
            view === "chat" && "hidden lg:flex"
          )}
        >
          <DesignExplorer
            hasPending={hasPending}
            onDownload={downloadDesign}
            onRemoveUpload={handleRemoveUpload}
            onReview={() => setReviewOpen(true)}
            onSelect={setSelectedPath}
            onUploadFiles={handleUploadFiles}
            paths={paths}
            project={project}
            selectedPath={selectedPath}
            selectedUpload={selectedUpload}
            uploading={uploading}
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
