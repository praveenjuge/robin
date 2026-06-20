import { SignInButton, SignUpButton } from "@clerk/nextjs"
import { FileText, GitBranch, MessagesSquare, Sparkles } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { ThemeToggle } from "@/components/app/theme-toggle"

const features = [
  {
    icon: MessagesSquare,
    title: "Chat to teach",
    description:
      "Describe your audience, platform, and visual direction. Robin turns the conversation into structure.",
  },
  {
    icon: GitBranch,
    title: "Review every change",
    description:
      "Robin proposes design.md diffs. Nothing lands until you approve it, so the source of truth stays trusted.",
  },
  {
    icon: FileText,
    title: "Ready for agents",
    description:
      "Keep tokens, principles, and references in one file your coding agents can read and build from.",
  },
]

export function MarketingLanding() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-14 items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="size-4" />
          </span>
          <span className="text-sm font-medium">Robin</span>
        </div>
        <ThemeToggle />
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-12 px-6 py-16">
        <section className="flex flex-col gap-6">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="size-3.5 text-primary" />
            Your project design memory
          </span>
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Grow a living design.md, one conversation at a time.
          </h1>
          <p className="max-w-xl text-base leading-7 text-muted-foreground">
            Chat with Robin to capture your design decisions, review every
            proposed change, and keep a single source of truth ready for your
            coding agents.
          </p>
          <div className="flex flex-wrap gap-3">
            <SignUpButton mode="modal">
              <Button size="lg">Get started</Button>
            </SignUpButton>
            <SignInButton mode="modal">
              <Button size="lg" variant="outline">
                Sign in
              </Button>
            </SignInButton>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          {features.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="flex flex-col gap-3 rounded-[min(var(--radius-4xl),24px)] border bg-card p-5 text-card-foreground shadow-sm ring-1 ring-foreground/5"
            >
              <span className="grid size-9 place-items-center rounded-xl bg-muted text-muted-foreground">
                <Icon className="size-4" />
              </span>
              <h2 className="text-sm font-medium">{title}</h2>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  )
}
