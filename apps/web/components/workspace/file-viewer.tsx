"use client"

import { useEffect, useState, type ReactNode } from "react"
import { Download, FileWarning, Trash2 } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"
import { MessageResponse } from "@/components/ai-elements/message"
import {
  DESIGN_PATH,
  formatBytes,
  isImageType,
  isPdfType,
  isTextType,
} from "@/lib/files"

export type ProjectUpload = {
  id: string
  name: string
  contentType: string
  size: number
  createdAt: string
  url: string
}

export function FileViewer({
  selectedPath,
  document,
  selectedUpload,
  designToolbar,
  onRemoveUpload,
}: {
  selectedPath: string | null
  document: string
  selectedUpload: ProjectUpload | null
  designToolbar?: ReactNode
  onRemoveUpload?: (upload: ProjectUpload) => void
}) {
  if (selectedPath === DESIGN_PATH) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {designToolbar}
        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          <MessageResponse className="text-sm">{document}</MessageResponse>
        </div>
      </div>
    )
  }

  if (selectedUpload) {
    return <UploadPreview onRemove={onRemoveUpload} upload={selectedUpload} />
  }

  return (
    <div className="grid flex-1 place-items-center p-6 text-sm text-muted-foreground">
      Select a file to preview it.
    </div>
  )
}

function UploadPreview({
  upload,
  onRemove,
}: {
  upload: ProjectUpload
  onRemove?: (upload: ProjectUpload) => void
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{upload.name}</p>
          <p className="text-xs text-muted-foreground">
            {upload.contentType || "Unknown type"} · {formatBytes(upload.size)}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {upload.url && (
            <Button
              aria-label="Download file"
              render={
                <a
                  download={upload.name}
                  href={upload.url}
                  rel="noreferrer"
                  target="_blank"
                />
              }
              size="icon-sm"
              title="Download"
              variant="ghost"
            >
              <Download />
            </Button>
          )}
          {onRemove && (
            <Button
              aria-label="Delete file"
              onClick={() => onRemove(upload)}
              size="icon-sm"
              title="Delete"
              variant="ghost"
            >
              <Trash2 />
            </Button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <UploadPreviewBody upload={upload} />
      </div>
    </div>
  )
}

function UploadPreviewBody({ upload }: { upload: ProjectUpload }) {
  if (!upload.url) {
    return <PreviewFallback message="This file is still processing." />
  }

  if (isImageType(upload.contentType)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        alt={upload.name}
        className="mx-auto max-h-full rounded-lg border bg-card object-contain"
        src={upload.url}
      />
    )
  }

  if (isPdfType(upload.contentType)) {
    return (
      <iframe
        className="size-full min-h-[60vh] rounded-lg border"
        src={upload.url}
        title={upload.name}
      />
    )
  }

  if (isTextType(upload.contentType) && upload.size <= 256_000) {
    return <TextPreview name={upload.name} url={upload.url} />
  }

  return (
    <PreviewFallback message="Preview isn't available for this file type. Download it to view the contents.">
      <Button
        render={
          <a
            download={upload.name}
            href={upload.url}
            rel="noreferrer"
            target="_blank"
          />
        }
        size="sm"
        variant="outline"
      >
        <Download />
        Download
      </Button>
    </PreviewFallback>
  )
}

function TextPreview({ name, url }: { name: string; url: string }) {
  const [state, setState] = useState<{
    status: "loading" | "ready" | "error"
    text: string
  }>({ status: "loading", text: "" })

  useEffect(() => {
    let active = true
    setState({ status: "loading", text: "" })
    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error("Failed to load file")
        return response.text()
      })
      .then((text) => {
        if (active) setState({ status: "ready", text })
      })
      .catch(() => {
        if (active) setState({ status: "error", text: "" })
      })
    return () => {
      active = false
    }
  }, [url])

  if (state.status === "loading") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner className="size-3.5" />
        Loading {name}...
      </div>
    )
  }

  if (state.status === "error") {
    return <PreviewFallback message="Could not load this file." />
  }

  return (
    <pre className="overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-5 whitespace-pre-wrap">
      {state.text}
    </pre>
  )
}

function PreviewFallback({
  message,
  children,
}: {
  message: string
  children?: ReactNode
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <FileWarning className="size-5 text-muted-foreground" />
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      {children}
    </div>
  )
}
