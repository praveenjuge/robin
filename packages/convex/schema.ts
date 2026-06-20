import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

export default defineSchema({
  projects: defineTable({
    ownerId: v.string(),
    name: v.string(),
    document: v.string(),
    latestCommit: v.optional(v.string()),
    updatedAt: v.number(),
    // The eve agent owns the durable chat transcript. Convex stores only the
    // serializable session cursor so the conversation is recoverable across
    // devices: the session id streams history, the continuation token resumes
    // the next turn, and the stream index bounds how far the replay reads.
    eveSessionId: v.optional(v.string()),
    eveContinuationToken: v.optional(v.string()),
    eveStreamIndex: v.optional(v.number()),
    // Deprecated: legacy in-flight review state. The browser now holds the
    // pending proposal. Retained as optional so the schema validates against
    // historical rows that still carry these fields; remove only after a
    // migration strips them from every existing document.
    pendingRequests: v.optional(v.array(v.object({ requestId: v.string() }))),
    pendingDiff: v.optional(v.string()),
    proposedDocument: v.optional(v.string()),
  }).index("by_owner", ["ownerId"]),
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
