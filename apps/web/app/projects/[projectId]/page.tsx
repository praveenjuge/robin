import { auth } from "@clerk/nextjs/server"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { ProjectWorkspace } from "@/components/workspace/project-workspace"

export const metadata: Metadata = {
  title: "Project",
  robots: {
    index: false,
    follow: false,
  },
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { userId } = await auth()
  if (!userId) {
    redirect("/")
  }

  const { projectId } = await params
  return <ProjectWorkspace key={projectId} projectId={projectId} />
}
