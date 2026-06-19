"use node"

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { ConvexError, v } from "convex/values"
import { internal } from "./_generated/api"
import { action } from "./_generated/server"
import type { Id } from "./_generated/dataModel"
import type { ActionCtx } from "./_generated/server"

type ApprovalResult = { commitId: string; document: string }
type PendingApproval = { proposedDocument: string } | null

export const approveDesign = action({
  args: { projectId: v.id("projects") },
  returns: v.object({ commitId: v.string(), document: v.string() }),
  handler: approveDesignHandler,
})

async function approveDesignHandler(
  ctx: ActionCtx,
  { projectId }: { projectId: Id<"projects"> }
): Promise<ApprovalResult> {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new ConvexError("Not authenticated")

  const pending: PendingApproval = await ctx.runQuery(
    internal.projects.getPendingApproval,
    {
      ownerId: identity.subject,
      projectId,
    }
  )
  if (!pending) throw new ConvexError("No pending design to approve.")

  const safeProjectId = sanitizeProjectId(projectId)
  const commitId = `r2-${Date.now().toString(36)}`
  await writeObject(
    projectKey(safeProjectId, "design.md"),
    pending.proposedDocument
  )
  await writeObject(
    projectKey(safeProjectId, `commits/${commitId}.md`),
    pending.proposedDocument
  )
  await writeObject(
    projectKey(safeProjectId, `commits/${commitId}.json`),
    JSON.stringify({ commitId, createdAt: new Date().toISOString() }),
    "application/json"
  )
  await ctx.runMutation(internal.projects.applyApprovedDesign, {
    commitId,
    document: pending.proposedDocument,
    ownerId: identity.subject,
    projectId,
  })
  return { commitId, document: pending.proposedDocument }
}

function sanitizeProjectId(projectId: string) {
  if (!/^[a-z0-9:_-]{8,80}$/i.test(projectId)) {
    throw new ConvexError("Invalid project id.")
  }
  return projectId
}

function projectKey(projectId: string, suffix: string) {
  return `projects/${projectId}/${suffix}`
}

async function writeObject(
  key: string,
  body: string,
  contentType = "text/markdown"
) {
  if (body.length > 80_000) throw new ConvexError("Document is too large.")
  await client().send(
    new PutObjectCommand({
      Body: body,
      Bucket: requiredEnv("R2_BUCKET"),
      ContentType: contentType,
      Key: key,
    })
  )
}

let s3Client: S3Client | null = null

function client() {
  if (s3Client) return s3Client
  const accountId = requiredEnv("CLOUDFLARE_ACCOUNT_ID")
  s3Client = new S3Client({
    credentials: {
      accessKeyId: requiredEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY"),
    },
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    region: "auto",
  })
  return s3Client
}

function requiredEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}.`)
  return value
}
