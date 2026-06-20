"use client"

import type { ComponentProps } from "react"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

export type SuggestionsProps = ComponentProps<"div">

export const Suggestions = ({
  className,
  children,
  ...props
}: SuggestionsProps) => (
  <div
    className={cn(
      "flex w-full flex-wrap items-center gap-2 overflow-x-auto",
      className
    )}
    {...props}
  >
    {children}
  </div>
)

export type SuggestionProps = Omit<ComponentProps<typeof Button>, "onClick"> & {
  suggestion: string
  onClick?: (suggestion: string) => void
}

export const Suggestion = ({
  suggestion,
  onClick,
  className,
  variant = "outline",
  size = "sm",
  children,
  ...props
}: SuggestionProps) => (
  <Button
    className={cn(
      "h-auto max-w-full rounded-full whitespace-normal text-left text-muted-foreground",
      className
    )}
    onClick={() => onClick?.(suggestion)}
    size={size}
    type="button"
    variant={variant}
    {...props}
  >
    {children ?? suggestion}
  </Button>
)
