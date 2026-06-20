import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

export default defineSchema({
  projects: defineTable({
    ownerId: v.string(),
    name: v.string(),
    document: v.string(),
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
