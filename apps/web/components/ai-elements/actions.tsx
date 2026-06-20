"use client"

import type { ComponentProps } from "react"
import { Button } from "@workspace/ui/components/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"

export type ActionsProps = ComponentProps<"div">

export const Actions = ({ className, children, ...props }: ActionsProps) => (
  <div className={cn("flex items-center gap-0.5", className)} {...props}>
    {children}
  </div>
)

export type ActionProps = ComponentProps<typeof Button> & {
  tooltip?: string
  label?: string
}

export const Action = ({
  tooltip,
  children,
  label,
  className,
  variant = "ghost",
  size = "icon-sm",
  ...props
}: ActionProps) => {
  const button = (
    <Button
      className={cn(
        "size-7 text-muted-foreground hover:text-foreground",
        className
      )}
      size={size}
      type="button"
      variant={variant}
      {...props}
    >
      {children}
      <span className="sr-only">{label || tooltip}</span>
    </Button>
  )

  if (!tooltip) return button

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={button} />
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
