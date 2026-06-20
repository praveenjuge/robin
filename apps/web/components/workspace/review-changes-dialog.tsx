"use client"

import { Check, X } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"

export function ReviewChangesDialog({
  open,
  onOpenChange,
  diff,
  busy,
  onApprove,
  onReject,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  diff: string
  busy: boolean
  onApprove: () => void
  onReject: () => void
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Review proposed changes</DialogTitle>
          <DialogDescription>
            Robin wants to update design.md. Approve to commit it, or reject to
            discard the proposal.
          </DialogDescription>
        </DialogHeader>
        <DiffView diff={diff} />
        <DialogFooter>
          <Button disabled={busy} onClick={onReject} variant="outline">
            <X />
            Reject
          </Button>
          <Button disabled={busy} onClick={onApprove}>
            {busy ? <Spinner /> : <Check />}
            Approve &amp; commit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DiffView({ diff }: { diff: string }) {
  const lines = diff.replace(/\n$/, "").split("\n")

  return (
    <div className="max-h-[55vh] overflow-auto rounded-lg border bg-muted/30 font-mono text-xs leading-5">
      {lines.map((line, index) => {
        const added = line.startsWith("+") && !line.startsWith("+++")
        const removed = line.startsWith("-") && !line.startsWith("---")
        const meta =
          line.startsWith("@@") ||
          line.startsWith("diff ") ||
          line.startsWith("+++") ||
          line.startsWith("---")
        return (
          <div
            key={index}
            className={cn(
              "px-3 whitespace-pre-wrap",
              added &&
                "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
              removed && "bg-red-500/10 text-red-700 dark:text-red-300",
              meta && "text-muted-foreground"
            )}
          >
            {line || "\u00a0"}
          </div>
        )
      })}
    </div>
  )
}
