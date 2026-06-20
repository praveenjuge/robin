import { ConvexError, v } from "convex/values"
import { mutation, query } from "./_generated/server"

const uploadView = v.object({
  _id: v.id("uploads"),
  _creationTime: v.number(),
  projectId: v.id("projects"),
  ownerId: v.string(),
  name: v.string(),
  storageId: v.id("_storage"),
  contentType: v.string(),
  size: v.number(),
  createdAt: v.number(),
  url: v.union(v.string(), v.null()),
})

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  async handler(ctx) {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new ConvexError("Not authenticated")
    return await ctx.storage.generateUploadUrl()
  },
})

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    storageId: v.id("_storage"),
    contentType: v.string(),
    size: v.number(),
  },
  returns: v.id("uploads"),
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new ConvexError("Not authenticated")
    const project = await ctx.db.get(args.projectId)
    if (!project || project.ownerId !== identity.subject) {
      throw new ConvexError("Project not found")
    }
    const name = args.name.trim().slice(0, 120) || "file"
    if (args.size > 25_000_000) {
      throw new ConvexError("Files must be 25 MB or smaller.")
    }
    return await ctx.db.insert("uploads", {
      projectId: args.projectId,
      ownerId: identity.subject,
      name,
      storageId: args.storageId,
      contentType: args.contentType.slice(0, 200),
      size: args.size,
      createdAt: Date.now(),
    })
  },
})

export const list = query({
  args: { projectId: v.id("projects") },
  returns: v.array(uploadView),
  async handler(ctx, { projectId }) {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []
    const project = await ctx.db.get(projectId)
    if (!project || project.ownerId !== identity.subject) return []
    const uploads = await ctx.db
      .query("uploads")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .order("desc")
      .take(200)
    return await Promise.all(
      uploads.map(async (upload) => ({
        ...upload,
        url: await ctx.storage.getUrl(upload.storageId),
      }))
    )
  },
})

export const remove = mutation({
  args: { uploadId: v.id("uploads") },
  returns: v.null(),
  async handler(ctx, { uploadId }) {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new ConvexError("Not authenticated")
    const upload = await ctx.db.get(uploadId)
    if (!upload || upload.ownerId !== identity.subject) {
      throw new ConvexError("Upload not found")
    }
    await ctx.storage.delete(upload.storageId)
    await ctx.db.delete(uploadId)
    return null
  },
})
