import { auth } from "@clerk/nextjs/server"
import { ProjectsDashboard } from "@/components/dashboard/projects-dashboard"
import { MarketingLanding } from "@/components/marketing/landing"

export default async function Page() {
  const { userId } = await auth()

  if (!userId) {
    return <MarketingLanding />
  }

  return <ProjectsDashboard />
}
