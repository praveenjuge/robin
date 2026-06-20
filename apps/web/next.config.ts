import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  transpilePackages: ["@workspace/ui", "@workspace/convex"],
  // eve/client is a server-only dependency used by the /api/agent route.
  // Keep it external so Next doesn't bundle the framework (and its nitro deps).
  serverExternalPackages: ["eve"],
}

export default nextConfig
