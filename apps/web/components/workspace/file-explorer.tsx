"use client"

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
