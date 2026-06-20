import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { ProjectWorkspace } from "@/components/workspace/project-workspace"

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
  return <ProjectWorkspace projectId={projectId} />
}
