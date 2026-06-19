import { SignInButton, SignUpButton, UserButton } from "@clerk/nextjs"
import { auth } from "@clerk/nextjs/server"
import { Bot, Check, FileText, Sparkles } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { ConvexClientProvider } from "@/components/convex-client-provider"
import { RobinWorkspace } from "@/components/robin-workspace"

export default async function Page() {
  const { userId } = await auth()

  return (
    <main className="min-h-svh bg-background text-foreground">
      {!userId ? (
        <section className="mx-auto flex min-h-svh w-full max-w-5xl flex-col justify-center gap-8 px-6 py-10">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Sparkles className="size-4 text-primary" />
            Robin
          </div>
          <div className="max-w-2xl space-y-5">
            <h1 className="text-4xl font-semibold tracking-normal sm:text-5xl">
              Your project design memory.
            </h1>
            <p className="max-w-xl text-base leading-7 text-muted-foreground">
              Chat with Robin to grow a living design.md, review every proposed
              change, and keep the source of truth ready for coding agents.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <SignInButton mode="modal">
              <Button>
                <Bot />
                Sign in
              </Button>
            </SignInButton>
            <SignUpButton mode="modal">
              <Button variant="outline">
                <Check />
                Sign up
              </Button>
            </SignUpButton>
          </div>
        </section>
      ) : (
        <ConvexClientProvider>
          <div className="flex min-h-svh flex-col">
            <header className="flex h-14 items-center justify-between border-b px-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <FileText className="size-4 text-primary" />
                Robin
              </div>
              <UserButton />
            </header>
            <RobinWorkspace />
          </div>
        </ConvexClientProvider>
      )}
    </main>
  )
}
