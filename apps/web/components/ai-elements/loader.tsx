"use client"

import type { ComponentProps } from "react"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"

export type LoaderProps = ComponentProps<"div"> & {
  label?: string
}

export const Loader = ({
  className,
  label = "Thinking",
  ...props
}: LoaderProps) => (
  <div
    className={cn(
      "flex items-center gap-2 text-sm text-muted-foreground",
      className
    )}
    {...props}
  >
    <Spinner className="size-3.5" />
    {label ? (
      <span className="animate-pulse">{label}</span>
    ) : (
      <span className="sr-only">Loading</span>
    )}
  </div>
)
