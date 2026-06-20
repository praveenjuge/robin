import { ConvexError, v } from "convex/values"
import { mutation, query } from "./_generated/server"
import type { Id } from "./_generated/dataModel"

const starterDoc = `---
color:
  primary: "#1B4D3E"
  surface: "#FFFFFF"
  text: "#111111"
typography:
  font_sans: "Inter"
  scale: [12, 14, 16, 20, 24, 32, 48]
spacing: [2, 4, 8, 12, 16, 24, 32, 48]
radius: { sm: 4, md: 8, lg: 16, pill: 999 }
components:
  button: { radius: pill, height: 40, weight: 600 }
---

## Overview
Robin has not learned this project yet.

## Principles
- Keep interfaces direct and legible.

## Voice & tone
Clear, calm, and specific.

## Components
Capture component guidance as Robin learns it.

## Don'ts
- Do not invent tokens without a source.
`

const projectFields = {
  _id: v.id("projects"),
  _creationTime: v.number(),
  ownerId: v.string(),
  name: v.string(),
  document: v.string(),
  latestCommit: v.optional(v.string()),
  updatedAt: v.number(),
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
      document: starterDoc,
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
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect()
    await Promise.all(messages.map((message) => ctx.db.delete(message._id)))
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

// Persists an approved design.md back to the project record. The eve agent
// owns the durable session and the R2 commit; Convex only mirrors the latest
// committed document so the workspace can render and download it.
export const saveDocument = mutation({
  args: {
    projectId: v.id("projects"),
    document: v.string(),
    commitId: v.optional(v.string()),
  },
  returns: v.null(),
  async handler(ctx, { projectId, document, commitId }) {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new ConvexError("Not authenticated")
    const project = await ctx.db.get(projectId)
    if (!project || project.ownerId !== identity.subject) {
      throw new ConvexError("Project not found")
    }
    if (document.length > 80_000)
      throw new ConvexError("Document is too large.")
    await ctx.db.patch(projectId as Id<"projects">, {
      document,
      latestCommit: commitId ?? `r2-${Date.now().toString(36)}`,
      updatedAt: Date.now(),
    })
    return null
  },
})
