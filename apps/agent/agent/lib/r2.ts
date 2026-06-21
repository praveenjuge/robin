import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"

export const MAX_UPLOAD_BYTES = 25_000_000

export function sanitizeProjectId(projectId: string) {
  if (!/^[a-z0-9:_-]{8,80}$/i.test(projectId))
    throw new Error("Invalid project id.")
  return projectId
}

export function projectKey(projectId: string, suffix: string) {
  return `projects/${sanitizeProjectId(projectId)}/${suffix}`
}

export async function readObject(key: string) {
  try {
    const response = await client().send(
      new GetObjectCommand({ Bucket: bucket(), Key: key })
    )
    return (await response.Body?.transformToString()) ?? ""
  } catch (error) {
    if (
      error instanceof NoSuchKey ||
      (error as { name?: string }).name === "NoSuchKey"
    ) {
      return null
    }
    throw error
  }
}

export async function writeObject(
  key: string,
  body: string,
  contentType = "text/markdown"
) {
  if (body.length > 80_000) throw new Error("Document is too large.")
  await client().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  )
}

// Returns the committed design.md, or null when the project has none yet. Robin
// builds the first document through chat, so there is no default placeholder:
// callers treat null as "no design.md exists yet."
export async function readDesignDoc(projectId: string) {
  return readObject(projectKey(projectId, "design.md"))
}

// --- Uploads ---------------------------------------------------------------
//
// Uploads live in the same project namespace as design.md and commits, so the
// eve agent owns every project artifact in one place. Each upload is two R2
// objects: the raw bytes (`<uploadId>.blob`, with its real content type) and a
// small metadata sidecar (`<uploadId>.json`) used to list and label files
// without a HeadObject round-trip per item.

export type UploadMeta = {
  uploadId: string
  name: string
  contentType: string
  size: number
  createdAt: string
}

const UPLOAD_ID_RE = /^[a-z0-9_-]{8,100}$/i

export function sanitizeUploadId(uploadId: string) {
  if (!UPLOAD_ID_RE.test(uploadId)) throw new Error("Invalid upload id.")
  return uploadId
}

function newUploadId() {
  return `upload-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`
}

function sanitizeUploadName(name: string) {
  return (
    name
      .trim()
      .replace(/[\r\n]+/g, " ")
      .slice(0, 120) || "file"
  )
}

function uploadBlobKey(projectId: string, uploadId: string) {
  return projectKey(projectId, `uploads/${sanitizeUploadId(uploadId)}.blob`)
}

function uploadMetaKey(projectId: string, uploadId: string) {
  return projectKey(projectId, `uploads/${sanitizeUploadId(uploadId)}.json`)
}

export function isAllowedUploadContentType(contentType: string) {
  return /^(image\/(png|jpe?g|webp|gif)|text\/plain|text\/markdown|application\/pdf)(;|$)/i.test(
    contentType
  )
}

export async function putUpload(
  projectId: string,
  input: { name: string; contentType: string; bytes: Uint8Array }
): Promise<UploadMeta> {
  const safeProjectId = sanitizeProjectId(projectId)
  if (input.bytes.byteLength < 1) throw new Error("Upload is empty.")
  if (input.bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error("Upload is too large.")
  }
  if (!isAllowedUploadContentType(input.contentType)) {
    throw new Error("Unsupported upload type.")
  }

  const meta: UploadMeta = {
    uploadId: newUploadId(),
    name: sanitizeUploadName(input.name),
    contentType: input.contentType,
    size: input.bytes.byteLength,
    createdAt: new Date().toISOString(),
  }

  await writeBytes(
    uploadBlobKey(safeProjectId, meta.uploadId),
    input.bytes,
    input.contentType
  )
  await writeObject(
    uploadMetaKey(safeProjectId, meta.uploadId),
    JSON.stringify(meta),
    "application/json"
  )
  return meta
}

export async function listUploads(projectId: string): Promise<UploadMeta[]> {
  const safeProjectId = sanitizeProjectId(projectId)
  const response = await client().send(
    new ListObjectsV2Command({
      Bucket: bucket(),
      Prefix: projectKey(safeProjectId, "uploads/"),
      MaxKeys: 1000,
    })
  )
  const metaKeys = (response.Contents ?? [])
    .map((object) => object.Key)
    .filter((key): key is string => Boolean(key?.endsWith(".json")))

  const metas = await Promise.all(
    metaKeys.map(async (key) => {
      const raw = await readObject(key)
      if (!raw) return null
      try {
        return JSON.parse(raw) as UploadMeta
      } catch {
        return null
      }
    })
  )
  return metas
    .filter((meta): meta is UploadMeta => meta !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function readUploadMeta(
  projectId: string,
  uploadId: string
): Promise<UploadMeta | null> {
  const raw = await readObject(uploadMetaKey(projectId, uploadId))
  if (!raw) return null
  try {
    return JSON.parse(raw) as UploadMeta
  } catch {
    return null
  }
}

export async function readUpload(
  projectId: string,
  uploadId: string
): Promise<{ meta: UploadMeta; bytes: Uint8Array } | null> {
  const meta = await readUploadMeta(projectId, uploadId)
  if (!meta) return null
  const bytes = await readObjectBytes(uploadBlobKey(projectId, uploadId))
  if (!bytes) return null
  return { meta, bytes }
}

export async function deleteUpload(projectId: string, uploadId: string) {
  const safeProjectId = sanitizeProjectId(projectId)
  await Promise.all([
    client().send(
      new DeleteObjectCommand({
        Bucket: bucket(),
        Key: uploadBlobKey(safeProjectId, uploadId),
      })
    ),
    client().send(
      new DeleteObjectCommand({
        Bucket: bucket(),
        Key: uploadMetaKey(safeProjectId, uploadId),
      })
    ),
  ])
}

async function writeBytes(key: string, bytes: Uint8Array, contentType: string) {
  await client().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: bytes,
      ContentType: contentType,
      ContentLength: bytes.byteLength,
    })
  )
}

async function readObjectBytes(key: string) {
  try {
    const response = await client().send(
      new GetObjectCommand({ Bucket: bucket(), Key: key })
    )
    const bytes = await response.Body?.transformToByteArray()
    return bytes ?? null
  } catch (error) {
    if (
      error instanceof NoSuchKey ||
      (error as { name?: string }).name === "NoSuchKey"
    ) {
      return null
    }
    throw error
  }
}

let s3Client: S3Client | null = null

function client() {
  if (s3Client) return s3Client
  const accountId = requiredEnv("CLOUDFLARE_ACCOUNT_ID")
  s3Client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requiredEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY"),
    },
  })
  return s3Client
}

function bucket() {
  return requiredEnv("R2_BUCKET")
}

function requiredEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}.`)
  return value
}
