import { defineTool } from "eve/tools"
import { z } from "zod"
import { readDesignDoc, sanitizeProjectId } from "../lib/r2.js"

export default defineTool({
  description:
    "Load the current design.md for a Robin project from durable R2 storage. When `exists` is false the project has no design.md yet, so build the first one from scratch through discovery instead of assuming defaults.",
  inputSchema: z.object({ projectId: z.string().min(8).max(80) }),
  async execute({ projectId }) {
    const safeProjectId = sanitizeProjectId(projectId)
    const document = await readDesignDoc(safeProjectId)
    return {
      projectId: safeProjectId,
      exists: document !== null,
      document: document ?? "",
    }
  },
})
