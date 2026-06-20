import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

export default defineSchema({
  projects: defineTable({
    ownerId: v.string(),
    name: v.string(),
    document: v.string(),
    latestCommit: v.optional(v.string()),
    updatedAt: v.number(),
    // Deprecated: legacy eve session/runtime fields. The app no longer reads
    // or writes these (eve now owns the durable session; the browser holds the
    // cursor). They are retained as optional so the schema validates against
    // historical rows that still contain them. Remove only after a migration
    // strips them from every existing document.
    eveSessionId: v.optional(v.string()),
    eveContinuationToken: v.optional(v.string()),
    eveStreamIndex: v.optional(v.number()),
    pendingRequests: v.optional(v.array(v.object({ requestId: v.string() }))),
    pendingDiff: v.optional(v.string()),
    proposedDocument: v.optional(v.string()),
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
