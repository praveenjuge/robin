"use client"

import {
  createContext,
  useContext,
  useId,
  useMemo,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react"
import { ChevronRightIcon, SearchIcon } from "lucide-react"
import { cn } from "@workspace/ui/lib/utils"

type TaskContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
  contentId: string
}

const TaskContext = createContext<TaskContextValue | null>(null)

function useTaskContext() {
  const context = useContext(TaskContext)
  if (!context) {
    throw new Error("Task components must be used within a <Task>")
  }
  return context
}

export type TaskProps = Omit<ComponentProps<"div">, "onToggle"> & {
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export const Task = ({
  className,
  defaultOpen = true,
  open: openProp,
  onOpenChange,
  children,
  ...props
}: TaskProps) => {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen)
  const contentId = useId()
  const open = openProp ?? uncontrolledOpen

  const value = useMemo<TaskContextValue>(
    () => ({
      open,
      contentId,
      setOpen: (next) => {
        setUncontrolledOpen(next)
        onOpenChange?.(next)
      },
    }),
    [open, contentId, onOpenChange]
  )

  return (
    <TaskContext.Provider value={value}>
      <div
        className={cn(
          "w-full rounded-xl border bg-card text-card-foreground",
          className
        )}
        data-state={open ? "open" : "closed"}
        {...props}
      >
        {children}
      </div>
    </TaskContext.Provider>
  )
}

export type TaskTriggerProps = Omit<ComponentProps<"button">, "title"> & {
  title: ReactNode
  icon?: ReactNode
}

export const TaskTrigger = ({
  className,
  title,
  icon,
  children,
  ...props
}: TaskTriggerProps) => {
  const { open, setOpen, contentId } = useTaskContext()

  return (
    <button
      aria-controls={contentId}
      aria-expanded={open}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium outline-none transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/30",
        className
      )}
      onClick={() => setOpen(!open)}
      type="button"
      {...props}
    >
      {icon ?? <SearchIcon className="size-4 text-muted-foreground" />}
      {children ?? <span className="flex-1 truncate">{title}</span>}
      <ChevronRightIcon
        className={cn(
          "size-4 shrink-0 text-muted-foreground transition-transform",
          open && "rotate-90"
        )}
      />
    </button>
  )
}

export type TaskContentProps = ComponentProps<"div">

export const TaskContent = ({
  className,
  children,
  ...props
}: TaskContentProps) => {
  const { open, contentId } = useTaskContext()
  if (!open) return null

  return (
    <div
      className={cn("space-y-2 border-t px-3 py-2.5 text-sm", className)}
      id={contentId}
      {...props}
    >
      {children}
    </div>
  )
}

export type TaskItemProps = ComponentProps<"div">

export const TaskItem = ({ className, ...props }: TaskItemProps) => (
  <div
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
)

export type TaskItemFileProps = ComponentProps<"span">

export const TaskItemFile = ({ className, ...props }: TaskItemFileProps) => (
  <span
    className={cn(
      "inline-flex items-center gap-1 rounded-md border bg-secondary px-1.5 py-0.5 font-mono text-xs text-secondary-foreground",
      className
    )}
    {...props}
  />
)
