"use client"

import { useRef } from "react"
import { Download, GitBranch, Upload } from "lucide-react"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"
import type { Doc } from "@workspace/convex/dataModel"
import {
  FileViewer,
  type ProjectUpload,
} from "@/components/workspace/file-viewer"
import { ProjectFileTree } from "@/components/workspace/project-file-tree"
import { UPLOADS_DIR } from "@/lib/files"

export function DesignExplorer({
  project,
  paths,
  selectedPath,
  selectedUpload,
  onSelect,
  onUploadFiles,
  uploading,
  onRemoveUpload,
  onReview,
  onDownload,
  hasPending,
}: {
  project: Doc<"projects">
  paths: string[]
  selectedPath: string
  selectedUpload: ProjectUpload | null
  onSelect: (path: string) => void
  onUploadFiles: (files: FileList) => void
  uploading: boolean
  onRemoveUpload: (upload: ProjectUpload) => void
  onReview: () => void
  onDownload: () => void
  hasPending: boolean
}) {
  const fileInput = useRef<HTMLInputElement>(null)

  const designToolbar = (
    <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <p className="truncate text-sm font-medium">design.md</p>
        {hasPending && <Badge variant="secondary">Pending</Badge>}
      </div>
      <div className="flex items-center gap-1">
        {hasPending && (
          <Button onClick={onReview} size="sm">
            <GitBranch />
            Review changes
          </Button>
        )}
        <Button
          aria-label="Download design.md"
          onClick={onDownload}
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
    <div className="flex min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b px-3">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Explorer
        </span>
        <Button
          disabled={uploading}
          onClick={() => fileInput.current?.click()}
          size="xs"
          variant="outline"
        >
          {uploading ? <Spinner /> : <Upload />}
          Upload
        </Button>
        <input
          className="hidden"
          multiple
          onChange={(event) => {
            if (event.target.files?.length) {
              onUploadFiles(event.target.files)
            }
            event.target.value = ""
          }}
          ref={fileInput}
          type="file"
        />
      </div>

      <div className="h-48 shrink-0 overflow-hidden border-b sm:h-56">
        <ProjectFileTree
          expandedPaths={[UPLOADS_DIR]}
          onSelect={onSelect}
          paths={paths}
          selectedPath={selectedPath}
        />
      </div>

      <FileViewer
        designToolbar={designToolbar}
        document={project.document}
        onRemoveUpload={onRemoveUpload}
        selectedPath={selectedPath}
        selectedUpload={selectedUpload}
      />
    </div>
  )
}
