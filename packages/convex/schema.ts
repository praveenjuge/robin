import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

const agentRequest = v.object({ requestId: v.string() })

export default defineSchema({
  projects: defineTable({
    ownerId: v.string(),
    name: v.string(),
    document: v.string(),
    pendingDiff: v.optional(v.string()),
    proposedDocument: v.optional(v.string()),
    pendingRequests: v.optional(v.array(agentRequest)),
    eveSessionId: v.optional(v.string()),
    eveContinuationToken: v.optional(v.string()),
    eveStreamIndex: v.optional(v.number()),
    latestCommit: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_owner", ["ownerId"]),
  messages: defineTable({
    projectId: v.id("projects"),
    ownerId: v.string(),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    createdAt: v.number(),
  }).index("by_project", ["projectId"]),
  uploads: defineTable({
    projectId: v.id("projects"),
    ownerId: v.string(),
    name: v.string(),
    storageId: v.id("_storage"),
    contentType: v.string(),
    size: v.number(),
    createdAt: v.number(),
  }).index("by_project", ["projectId"]),
})
