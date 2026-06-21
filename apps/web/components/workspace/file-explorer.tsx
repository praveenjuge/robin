"use client"

import { Files } from "lucide-react"
import { ProjectFileTree } from "@/components/workspace/project-file-tree"
import { UPLOADS_DIR } from "@/lib/files"

export function FileExplorer({
  paths,
  selectedPath,
  onSelect,
}: {
  paths: string[]
  selectedPath: string | null
  onSelect: (path: string) => void
}) {
  if (paths.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <Files className="size-5 text-muted-foreground" />
        <p className="max-w-60 text-sm text-muted-foreground">
          No files yet. Chat with Robin to create your design.md.
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-hidden">
      <ProjectFileTree
        expandedPaths={[UPLOADS_DIR]}
        onSelect={onSelect}
        paths={paths}
        selectedPath={selectedPath}
      />
    </div>
  )
}
