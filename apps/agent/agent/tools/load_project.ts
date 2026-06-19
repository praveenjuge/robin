import { defineTool } from "eve/tools";
import { z } from "zod";
import { readDesignDoc, sanitizeProjectId } from "../lib/r2.js";

export default defineTool({
  description: "Load the current design.md for a Robin project from durable R2 storage.",
  inputSchema: z.object({ projectId: z.string().min(8).max(80) }),
  async execute({ projectId }) {
    const safeProjectId = sanitizeProjectId(projectId);
    return { projectId: safeProjectId, document: await readDesignDoc(safeProjectId) };
  },
});
