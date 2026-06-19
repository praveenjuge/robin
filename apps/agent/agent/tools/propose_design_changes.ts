import { defineTool } from "eve/tools";
import { z } from "zod";
import { unifiedDiff } from "../lib/diff.js";
import { readDesignDoc, sanitizeProjectId } from "../lib/r2.js";

export default defineTool({
  description:
    "Create a proposed design.md update and return its unified diff. After this succeeds, immediately call commit_design with the exact proposed document and summary so the user receives one approval prompt in the same turn.",
  inputSchema: z.object({
    projectId: z.string().min(8).max(80),
    proposedDocument: z.string().min(40).max(80_000),
    summary: z.string().min(3).max(500),
  }),
  async execute({ projectId, proposedDocument, summary }) {
    const safeProjectId = sanitizeProjectId(projectId);
    const currentDocument = await readDesignDoc(safeProjectId);
    return {
      projectId: safeProjectId,
      summary,
      proposedDocument,
      diff: unifiedDiff(currentDocument, proposedDocument),
    };
  },
  toModelOutput(output) {
    return { type: "json", value: { summary: output.summary, diff: output.diff } };
  },
});
