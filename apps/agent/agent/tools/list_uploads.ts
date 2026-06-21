import { defineTool } from "eve/tools"
import { z } from "zod"
import { listUploads, sanitizeProjectId } from "../lib/r2.js"

export default defineTool({
  description:
    "List the files the user has uploaded to this Robin project (images, text, Markdown, PDFs). Returns each upload's id, name, content type, size, and upload time. Use the upload id with read_upload to read a text file's contents.",
  inputSchema: z.object({ projectId: z.string().min(8).max(80) }),
  async execute({ projectId }) {
    const safeProjectId = sanitizeProjectId(projectId)
    const uploads = await listUploads(safeProjectId)
    return { projectId: safeProjectId, uploads }
  },
})
