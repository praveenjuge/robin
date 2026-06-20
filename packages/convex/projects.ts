import { ConvexError, v } from "convex/values"
import { mutation, query } from "./_generated/server"
import type { Id } from "./_generated/dataModel"

const projectFields = {
  _id: v.id("projects"),
  _creationTime: v.number(),
  ownerId: v.string(),
  name: v.string(),
  updatedAt: v.number(),
  // The eve agent owns the durable session and the design.md document (in R2).
  // Convex stores the session cursor so the chat is recoverable across devices.
  // See schema.ts.
  eveSessionId: v.optional(v.string()),
  eveContinuationToken: v.optional(v.string()),
  eveStreamIndex: v.optional(v.number()),
}

const projectValidator = v.object(projectFields)

export const list = query({
  args: {},
  returns: v.array(projectValidator),
  async handler(ctx) {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []
    return await ctx.db
      .query("projects")
      .withIndex("by_owner", (q) => q.eq("ownerId", identity.subject))
      .order("desc")
      .take(50)
  },
})

export const get = query({
  args: { projectId: v.id("projects") },
  returns: v.union(projectValidator, v.null()),
  async handler(ctx, { projectId }) {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null
    const project = await ctx.db.get(projectId)
    return project?.ownerId === identity.subject ? project : null
  },
})

export const create = mutation({
  args: { name: v.string() },
  returns: v.id("projects"),
  async handler(ctx, { name }) {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new ConvexError("Not authenticated")
    const cleanName = name.trim()
    if (cleanName.length < 2 || cleanName.length > 80) {
      throw new ConvexError("Project names must be 2 to 80 characters.")
    }
    const existing = await ctx.db
      .query("projects")
      .withIndex("by_owner", (q) => q.eq("ownerId", identity.subject))
      .take(50)
    if (existing.length >= 50) throw new ConvexError("Project limit reached.")
    return await ctx.db.insert("projects", {
      ownerId: identity.subject,
      name: cleanName,
      updatedAt: Date.now(),
    })
  },
})

export const rename = mutation({
  args: { projectId: v.id("projects"), name: v.string() },
  returns: v.null(),
  async handler(ctx, { projectId, name }) {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new ConvexError("Not authenticated")
    const project = await ctx.db.get(projectId)
    if (!project || project.ownerId !== identity.subject) {
      throw new ConvexError("Project not found")
    }
    const cleanName = name.trim()
    if (cleanName.length < 2 || cleanName.length > 80) {
      throw new ConvexError("Project names must be 2 to 80 characters.")
    }
    if (cleanName === project.name) return null
    await ctx.db.patch(projectId as Id<"projects">, {
      name: cleanName,
      updatedAt: Date.now(),
    })
    return null
  },
})

export const remove = mutation({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  async handler(ctx, { projectId }) {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new ConvexError("Not authenticated")
    const project = await ctx.db.get(projectId)
    if (!project || project.ownerId !== identity.subject) {
      throw new ConvexError("Project not found")
    }
    const uploads = await ctx.db
      .query("uploads")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect()
    await Promise.all(
      uploads.map(async (upload) => {
        await ctx.storage.delete(upload.storageId)
        await ctx.db.delete(upload._id)
      })
    )
    await ctx.db.delete(projectId as Id<"projects">)
    return null
  },
})

// Persists the eve session cursor so the durable conversation is recoverable
// across devices and reloads. eve owns the transcript itself; this row only
// stores the handles needed to stream history (sessionId + streamIndex) and
// resume the next turn (continuationToken).
export const saveAgentSession = mutation({
  args: {
    projectId: v.id("projects"),
    sessionId: v.optional(v.string()),
    continuationToken: v.optional(v.string()),
    streamIndex: v.optional(v.number()),
  },
  returns: v.null(),
  async handler(ctx, { projectId, sessionId, continuationToken, streamIndex }) {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new ConvexError("Not authenticated")
    const project = await ctx.db.get(projectId)
    if (!project || project.ownerId !== identity.subject) {
      throw new ConvexError("Project not found")
    }
    await ctx.db.patch(projectId as Id<"projects">, {
      eveSessionId: sessionId,
      eveContinuationToken: continuationToken,
      eveStreamIndex: streamIndex,
      updatedAt: Date.now(),
    })
    return null
  },
})
