import { defineTool } from "eve/tools"
import { z } from "zod"
import { unifiedDiff } from "../lib/diff.js"
import { readDesignDoc, sanitizeProjectId } from "../lib/r2.js"

export default defineTool({
  description:
    "Create a proposed design.md update and return its unified diff. After this succeeds, ask the user to confirm the change with the ask_question tool (showing the summary and diff). Only call commit_design once they approve.",
  inputSchema: z.object({
    projectId: z.string().min(8).max(80),
    proposedDocument: z.string().min(40).max(80_000),
    summary: z.string().min(3).max(500),
  }),
  async execute({ projectId, proposedDocument, summary }) {
    const safeProjectId = sanitizeProjectId(projectId)
    // null when the project has no design.md yet; diff against an empty
    // baseline so the first proposal reads as a full creation.
    const currentDocument = (await readDesignDoc(safeProjectId)) ?? ""
    return {
      projectId: safeProjectId,
      summary,
      proposedDocument,
      diff: unifiedDiff(currentDocument, proposedDocument),
    }
  },
  toModelOutput(output) {
    return {
      type: "json",
      value: { summary: output.summary, diff: output.diff },
    }
  },
})
