import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { generateImpactAnalysisCode } from "../orchestrator/program.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const client = new Client({
  name: "smart-orchestrator-smoke-client",
  version: "0.1.0",
});

const transport = new StdioClientTransport({
  command: path.join(root, "node_modules/.bin/tsx"),
  args: ["src/mcp/server.ts"],
  cwd: root,
  stderr: "pipe",
});

try {
  await client.connect(transport);

  const tools = await client.listTools();
  const code = generateImpactAnalysisCode({
    oldFile: "fixtures/v1/library/Parser.java",
    newFile: "fixtures/v2/library/Parser.java",
    appRoot: "fixtures/app",
  });

  const execution = await client.callTool({
    name: "execute_typescript",
    arguments: { code },
  });

  console.log(
    JSON.stringify(
      {
        tools: tools.tools.map((tool) => tool.name),
        execution: "structuredContent" in execution ? execution.structuredContent : execution,
      },
      null,
      2,
    ),
  );
} finally {
  await client.close();
}
