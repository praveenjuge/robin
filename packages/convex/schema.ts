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
