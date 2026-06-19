import { ConvexError, v } from "convex/values"
import { mutation, query } from "./_generated/server"

const messageValidator = v.object({
  _id: v.id("messages"),
  _creationTime: v.number(),
  projectId: v.id("projects"),
  ownerId: v.string(),
  role: v.union(v.literal("user"), v.literal("assistant")),
  content: v.string(),
  createdAt: v.number(),
})

export const list = query({
  args: { projectId: v.id("projects") },
  returns: v.array(messageValidator),
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []
    const project = await ctx.db.get(args.projectId)
    if (!project || project.ownerId !== identity.subject) return []
    return await ctx.db
      .query("messages")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("asc")
      .take(80)
  },
})

export const record = mutation({
  args: {
    projectId: v.id("projects"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
  },
  returns: v.union(v.id("messages"), v.null()),
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new ConvexError("Not authenticated")
    const project = await ctx.db.get(args.projectId)
    if (!project || project.ownerId !== identity.subject) {
      throw new ConvexError("Project not found")
    }
    const content = args.content.trim().slice(0, 6000)
    if (!content) return null
    return await ctx.db.insert("messages", {
      projectId: args.projectId,
      ownerId: identity.subject,
      role: args.role,
      content,
      createdAt: Date.now(),
    })
  },
})
