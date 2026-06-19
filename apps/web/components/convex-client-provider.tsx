"use client"

import { useAuth } from "@clerk/nextjs"
import { ConvexReactClient } from "convex/react"
import { ConvexProviderWithClerk } from "convex/react-clerk"
import { useMemo } from "react"

export function ConvexClientProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const convex = useMemo(
    () =>
      new ConvexReactClient(
        process.env.NEXT_PUBLIC_CONVEX_URL ??
          "https://missing-convex-url.convex.cloud"
      ),
    []
  )

  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  )
}
