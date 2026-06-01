export { ToolRegistry, toolRegistry } from "./registry";
export { searchTool } from "./search";
export { codeTool } from "./code";
export { webFetchTool } from "./web-fetch";
export { deployTool } from "./deploy";
export { readFileTool } from "./read-file";
export { writeFileTool } from "./write-file";
export { editFileTool } from "./edit-file";
export { bashTool } from "./bash";
export { globTool } from "./glob";
export { grepTool } from "./grep";
export { knowledgeSearchTool } from "./knowledge-search";

import { toolRegistry } from "./registry";
import { searchTool } from "./search";
import { codeTool } from "./code";
import { webFetchTool } from "./web-fetch";
import { deployTool } from "./deploy";
import { readFileTool } from "./read-file";
import { writeFileTool } from "./write-file";
import { editFileTool } from "./edit-file";
import { bashTool } from "./bash";
import { globTool } from "./glob";
import { grepTool } from "./grep";
import { knowledgeSearchTool } from "./knowledge-search";

const ALL_TOOLS = [
  searchTool, codeTool, webFetchTool, deployTool,
  readFileTool, writeFileTool, editFileTool,
  bashTool, globTool, grepTool, knowledgeSearchTool,
];

export function registerAllTools(): void {
  for (const tool of ALL_TOOLS) {
    if (!toolRegistry.get(tool.name)) toolRegistry.register(tool);
  }
}

export function getRegisteredTools(): string[] {
  return ALL_TOOLS.map((t) => t.name);
}

export type { ITool, ToolContext, ToolResult } from "@agenthub/shared";
