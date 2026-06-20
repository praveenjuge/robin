"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useMutation, useQuery } from "convex/react"
import {
  FileText,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Input } from "@workspace/ui/components/input"
import { AppHeader } from "@/components/app/app-header"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { ProjectFormDialog } from "@/components/app/project-form-dialog"
import { api } from "@workspace/convex/api"
import type { Doc } from "@workspace/convex/dataModel"
import { formatRelativeTime } from "@/lib/format"

type Project = Doc<"projects">

export function ProjectsDashboard() {
  const router = useRouter()
  const projects = useQuery(api.projects.list)
  const createProject = useMutation(api.projects.create)
  const renameProject = useMutation(api.projects.rename)
  const removeProject = useMutation(api.projects.remove)

  const [query, setQuery] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<Project | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null)

  const filtered = useMemo(() => {
    if (!projects) return undefined
    const term = query.trim().toLowerCase()
    if (!term) return projects
    return projects.filter((project) =>
      project.name.toLowerCase().includes(term)
    )
  }, [projects, query])

  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">
            Each project keeps a living design.md that Robin grows with you.
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search projects"
              value={query}
            />
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            New project
          </Button>
        </div>

        <div className="mt-6">
          {filtered === undefined ? (
            <ProjectGridSkeleton />
          ) : projects && projects.length === 0 ? (
            <EmptyState onCreate={() => setCreateOpen(true)} />
          ) : filtered.length === 0 ? (
            <p className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">
              No projects match &ldquo;{query}&rdquo;.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((project) => (
                <ProjectCard
                  key={project._id}
                  onDelete={() => setDeleteTarget(project)}
                  onRename={() => setRenameTarget(project)}
                  project={project}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <ProjectFormDialog
        onOpenChange={setCreateOpen}
        onSubmit={async (name) => {
          const id = await createProject({ name })
          router.push(`/projects/${id}`)
        }}
        open={createOpen}
        submitLabel="Create project"
        title="New project"
        description="Name your project. You can rename it any time."
      />

      <ProjectFormDialog
        initialName={renameTarget?.name ?? ""}
        onOpenChange={(open) => !open && setRenameTarget(null)}
        onSubmit={async (name) => {
          if (renameTarget) {
            await renameProject({ projectId: renameTarget._id, name })
          }
        }}
        open={Boolean(renameTarget)}
        submitLabel="Save"
        title="Rename project"
      />

      <ConfirmDialog
        confirmLabel="Delete project"
        description={
          <>
            This permanently deletes{" "}
            <span className="font-medium text-foreground">
              {deleteTarget?.name}
            </span>
            , its chat history, uploaded files, and design.md. This can&apos;t
            be undone.
          </>
        }
        destructive
        onConfirm={async () => {
          if (deleteTarget) {
            await removeProject({ projectId: deleteTarget._id })
          }
        }}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        open={Boolean(deleteTarget)}
        title="Delete project?"
      />
    </div>
  )
}

function ProjectCard({
  project,
  onRename,
  onDelete,
}: {
  project: Project
  onRename: () => void
  onDelete: () => void
}) {
  return (
    <div className="group relative flex flex-col gap-3 rounded-[min(var(--radius-4xl),24px)] border bg-card p-5 text-card-foreground ring-1 ring-foreground/5 transition-shadow focus-within:ring-ring/40 hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <span className="grid size-9 place-items-center rounded-xl bg-muted text-muted-foreground">
          <FileText className="size-4" />
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                aria-label="Project actions"
                className="relative z-10 text-muted-foreground"
                size="icon-sm"
                variant="ghost"
              />
            }
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onRename}>
              <Pencil />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} variant="destructive">
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-col gap-1">
        <Link
          className="text-base font-medium outline-none after:absolute after:inset-0 after:rounded-[inherit] focus-visible:underline"
          href={`/projects/${project._id}`}
        >
          {project.name}
        </Link>
        <p className="text-xs text-muted-foreground">
          Updated {formatRelativeTime(project.updatedAt)}
        </p>
      </div>
    </div>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-[min(var(--radius-4xl),24px)] border border-dashed py-20 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
        <FolderPlus className="size-6" />
      </span>
      <div className="space-y-1">
        <h2 className="text-base font-medium">Create your first project</h2>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">
          Start a project and chat with Robin to shape its design system.
        </p>
      </div>
      <Button onClick={onCreate}>
        <Plus />
        New project
      </Button>
    </div>
  )
}

function ProjectGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="h-36 animate-pulse rounded-[min(var(--radius-4xl),24px)] border bg-muted/40"
        />
      ))}
    </div>
  )
}
