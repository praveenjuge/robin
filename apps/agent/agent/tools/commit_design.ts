import { defineTool } from "eve/tools"
import { z } from "zod"
import { projectKey, sanitizeProjectId, writeObject } from "../lib/r2.js"

export default defineTool({
  description:
    "Commit a design.md to R2 and mirror a commit record. Only call this AFTER the user has explicitly confirmed the change through an ask_question prompt. Never call it without that confirmation in the same conversation.",
  inputSchema: z.object({
    projectId: z.string().min(8).max(80),
    document: z.string().min(40).max(80_000),
    summary: z.string().min(3).max(500),
  }),
  async execute({ projectId, document, summary }) {
    const safeProjectId = sanitizeProjectId(projectId)
    const commitId = `commit-${Date.now().toString(36)}`
    await writeObject(projectKey(safeProjectId, "design.md"), document)
    await writeObject(
      projectKey(safeProjectId, `commits/${commitId}.md`),
      document
    )
    await writeObject(
      projectKey(safeProjectId, `commits/${commitId}.json`),
      JSON.stringify({
        commitId,
        summary,
        createdAt: new Date().toISOString(),
      }),
      "application/json"
    )
    return { projectId: safeProjectId, commitId, summary, document }
  },
  toModelOutput(output) {
    return {
      type: "json",
      value: { commitId: output.commitId, summary: output.summary },
    }
  },
})
