import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { config } from "../config.js";
import { javaSymbolSchema } from "../schemas.js";
import { gumtreeDiff } from "../tools/gumtree.js";
import { findJavaCallSites } from "../tools/usage.js";
import { jsonResult } from "./result.js";

const server = new McpServer({
  name: `${config.project.name}-direct-tools`,
  version: config.project.version,
});

const pathSchema = z.string().min(1);
const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

server.registerTool(
  "gumtree_diff",
  {
    title: "Diff Java library versions",
    description:
      "Returns the raw GumTree structural diff and normalized Java method-signature changes.",
    inputSchema: {
      oldFile: pathSchema,
      newFile: pathSchema,
    },
    annotations: readOnlyAnnotations,
  },
  async ({ oldFile, newFile }) =>
    jsonResult(await gumtreeDiff({ oldFile, newFile })),
);

server.registerTool(
  "find_java_call_sites",
  {
    title: "Find Java call sites",
    description:
      "Finds application call sites for the supplied normalized Java method symbols.",
    inputSchema: {
      rootDirectory: pathSchema,
      symbols: z.array(javaSymbolSchema),
    },
    annotations: readOnlyAnnotations,
  },
  async ({ rootDirectory, symbols }) =>
    jsonResult(await findJavaCallSites({ rootDirectory, symbols })),
);

await server.connect(new StdioServerTransport());
