"use client"

import { useEffect, useRef, type CSSProperties } from "react"
import { FileTree, useFileTree } from "@pierre/trees/react"
import { cn } from "@workspace/ui/lib/utils"

// Map the tree's themable custom properties onto the shadcn tokens. These
// custom properties pierce the tree's shadow DOM, so the file tree inherits
// the app theme (including light/dark) automatically.
const TREE_THEME = {
  "--trees-theme-sidebar-bg": "transparent",
  "--trees-theme-sidebar-fg": "var(--foreground)",
  "--trees-theme-sidebar-border": "var(--border)",
  "--trees-theme-sidebar-header-fg": "var(--muted-foreground)",
  "--trees-theme-list-hover-bg": "var(--muted)",
  "--trees-theme-list-active-selection-bg": "var(--accent)",
  "--trees-theme-list-active-selection-fg": "var(--accent-foreground)",
  "--trees-theme-input-bg": "var(--background)",
  "--trees-theme-input-fg": "var(--foreground)",
  "--trees-theme-focus-ring": "var(--ring)",
  "--trees-theme-scrollbar-thumb": "var(--border)",
} as CSSProperties

export type ProjectFileTreeProps = {
  paths: string[]
  selectedPath?: string | null
  expandedPaths?: string[]
  onSelect: (path: string) => void
  className?: string
}

export function ProjectFileTree({
  paths,
  selectedPath,
  expandedPaths = [],
  onSelect,
  className,
}: ProjectFileTreeProps) {
  // Refs let the (stable) tree callbacks read the latest props without
  // recreating the model, which `useFileTree` only builds once.
  const filePathsRef = useRef(new Set(paths))
  filePathsRef.current = new Set(paths)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const expandedRef = useRef(expandedPaths)
  expandedRef.current = expandedPaths

  const { model } = useFileTree({
    paths,
    search: true,
    density: "compact",
    initialExpandedPaths: expandedPaths,
    initialSelectedPaths: selectedPath ? [selectedPath] : [],
    onSelectionChange: (selected) => {
      const next = selected[0]
      if (next && filePathsRef.current.has(next)) {
        onSelectRef.current(next)
      }
    },
  })

  // Rebuild the tree contents when the file set changes (e.g. new uploads).
  const pathsKey = paths.join("\u0000")
  const prevPathsKey = useRef(pathsKey)
  useEffect(() => {
    if (prevPathsKey.current === pathsKey) return
    prevPathsKey.current = pathsKey
    model.resetPaths(paths, { initialExpandedPaths: expandedRef.current })
    if (selectedPath && filePathsRef.current.has(selectedPath)) {
      model.getItem(selectedPath)?.select()
    }
  }, [pathsKey, paths, model, selectedPath])

  // Reflect external selection changes (e.g. switching files from elsewhere).
  useEffect(() => {
    if (!selectedPath) return
    if (model.getSelectedPaths()[0] === selectedPath) return
    model.getItem(selectedPath)?.select()
    model.scrollToPath(selectedPath, { offset: "nearest" })
  }, [selectedPath, model])

  return (
    <FileTree
      className={cn("size-full text-sm", className)}
      model={model}
      style={TREE_THEME}
    />
  )
}
