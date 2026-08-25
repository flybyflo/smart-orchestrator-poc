import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { config } from "../config.js";
import { executeTypeScript } from "../orchestrator/execute.js";
import {
  sandboxCapabilities as capabilities,
  searchCapabilities,
  typeDefinitionsFor,
} from "../orchestrator/bindings.js";
import { jsonResult } from "./result.js";

const server = new McpServer({
  name: config.project.name,
  version: config.project.version,
});

server.registerTool(
  "search_capabilities",
  {
    title: "Search analysis capabilities",
    description:
      "Search the typed analysis capabilities available to generated TypeScript.",
    inputSchema: {
      query: z.string().default(""),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  ({ query }) => {
    const matches = searchCapabilities(query);

    return jsonResult({
      capabilities: matches.map(({ name, title, description }) => ({
        name,
        title,
        description,
      })),
    });
  },
);

server.registerTool(
  "get_type_definitions",
  {
    title: "Get TypeScript API definitions",
    description:
      "Return TypeScript definitions for selected capabilities before generating code.",
    inputSchema: {
      capabilities: z.array(z.enum(capabilities.map((capability) => capability.name) as [
        string,
        ...string[],
      ])),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  ({ capabilities: names }) =>
    jsonResult({ typeDefinitions: typeDefinitionsFor(names) }),
);

server.registerTool(
  "execute_typescript",
  {
    title: "Execute generated TypeScript",
    description:
      "Run generated TypeScript in an isolated sandbox with typed dependency-upgrade analysis functions injected as global async functions.",
    inputSchema: {
      code: z.string().min(1),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ code }) => {
    const result = await executeTypeScript({ code });

    return {
      ...jsonResult(result),
      isError: !result.ok,
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
