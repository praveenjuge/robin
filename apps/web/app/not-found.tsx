import Link from "next/link"
import { Compass } from "lucide-react"

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-5xl flex-col justify-center gap-6 px-6 py-16">
      <span className="inline-flex w-fit items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
        <Compass className="size-3.5 text-primary" />
        404
      </span>
      <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
        This page doesn&apos;t exist.
      </h1>
      <div className="max-w-xl text-base leading-7 text-muted-foreground">
        <p>
          The path you requested returned a 404. Robin is a living design memory
          for your projects — chat to capture design decisions, review every
          proposed change, and keep a single design.md your coding agents can
          build from.
        </p>
      </div>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Where to go next</h2>
        <ul className="list-disc pl-5 text-base leading-7 text-muted-foreground">
          <li>
            <Link
              className="text-foreground underline underline-offset-4"
              href="/"
            >
              Home
            </Link>{" "}
            — sign in or explore what Robin does
          </li>
          <li>Project pages live under /projects and require signing in</li>
        </ul>
      </section>
    </main>
  )
}
