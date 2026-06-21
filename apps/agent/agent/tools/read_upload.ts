import { defineTool } from "eve/tools"
import { z } from "zod"
import { readUpload, sanitizeProjectId, sanitizeUploadId } from "../lib/r2.js"

const MAX_TEXT_CHARS = 80_000

function isTextLike(contentType: string) {
  return /^(text\/|application\/(json|xml)|.*\+(json|xml))/i.test(contentType)
}

export default defineTool({
  description:
    "Read a previously uploaded file's contents from durable storage by its upload id (get ids from list_uploads). Returns the decoded text for text and Markdown files. Image and PDF bytes are not returned here; the model receives those inline on the turn they are uploaded.",
  inputSchema: z.object({
    projectId: z.string().min(8).max(80),
    uploadId: z.string().min(8).max(100),
  }),
  async execute({ projectId, uploadId }) {
    const safeProjectId = sanitizeProjectId(projectId)
    const safeUploadId = sanitizeUploadId(uploadId)
    const result = await readUpload(safeProjectId, safeUploadId)
    if (!result) {
      return { found: false as const, uploadId: safeUploadId }
    }

    const { meta, bytes } = result
    if (!isTextLike(meta.contentType)) {
      return {
        found: true as const,
        uploadId: meta.uploadId,
        name: meta.name,
        contentType: meta.contentType,
        size: meta.size,
        text: null,
        note: "Binary file (image or PDF). Its contents are provided to you inline on the turn it is uploaded, not as text here.",
      }
    }

    const text = new TextDecoder().decode(bytes)
    const truncated = text.length > MAX_TEXT_CHARS
    return {
      found: true as const,
      uploadId: meta.uploadId,
      name: meta.name,
      contentType: meta.contentType,
      size: meta.size,
      text: truncated ? text.slice(0, MAX_TEXT_CHARS) : text,
      truncated,
    }
  },
})
