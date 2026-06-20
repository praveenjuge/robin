"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { UserButton } from "@clerk/nextjs"
import { Sparkles } from "lucide-react"
import { Separator } from "@workspace/ui/components/separator"

export function AppHeader({
  children,
  actions,
}: {
  children?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3 sm:px-4">
      <Link
        aria-label="Robin home"
        className="flex shrink-0 items-center gap-2 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
        href="/"
      >
        <span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground">
          <Sparkles className="size-4" />
        </span>
        <span className="hidden text-sm font-medium sm:inline">Robin</span>
      </Link>
      {children ? (
        <>
          <Separator
            className="hidden h-full sm:block"
            orientation="vertical"
          />
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {children}
          </div>
        </>
      ) : (
        <div className="flex-1" />
      )}
      <div className="flex shrink-0 items-center gap-1">
        {actions}
        <UserButton />
      </div>
    </header>
  )
}
