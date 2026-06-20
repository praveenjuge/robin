import { Spinner } from "@workspace/ui/components/spinner"

export default function Loading() {
  return (
    <div className="grid h-svh place-items-center">
      <Spinner className="size-5 text-muted-foreground" />
    </div>
  )
}
