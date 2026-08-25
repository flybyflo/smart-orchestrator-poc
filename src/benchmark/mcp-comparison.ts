import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { buildImpactReport, measureImpactReport } from "../core/impact-analysis.js";
import { generateImpactAnalysisCode } from "../orchestrator/program.js";
import { oldSymbolsFrom } from "../orchestrator/symbols.js";
import { jsonByteSize } from "../runtime.js";
import type { GumTreeDiffResult, UsageSearchResult } from "../types.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

interface ToolCallMetric {
  name: string;
  inputBytes: number;
  outputBytes: number;
  durationMs: number;
}

interface BenchResult {
  name: string;
  serverFile: string;
  listedToolCount: number;
  listedTools: string[];
  schemaBytes: number;
  toolInputBytes: number;
  toolOutputBytes: number;
  totalMeasuredBytes: number;
  toolCallCount: number;
  durationMs: number;
  finalResultBytes: number;
  finalResult: unknown;
  metadata?: Record<string, unknown>;
  calls: ToolCallMetric[];
}

const benchmarkTask = {
  oldFile: "fixtures/v1/library/Parser.java",
  newFile: "fixtures/v2/library/Parser.java",
  appRoot: "fixtures/app",
};

const codeExecProgram = generateImpactAnalysisCode(benchmarkTask);

async function main(): Promise<void> {
  const codeExec = await runCodeExecBenchmark();
  const directTools = await runDirectToolsBenchmark();
  const outputsMatch = JSON.stringify(codeExec.finalResult) === JSON.stringify(directTools.finalResult);

  if (!outputsMatch) {
    throw new Error("Benchmark workflows produced different final reports.");
  }

  const comparison = {
    generatedAt: new Date().toISOString(),
    metric:
      "UTF-8 bytes of JSON payloads with volatile durationMs values normalized to zero",
    scenario: "Parser.parse(String) -> Parser.parse(String, boolean) plus parseInt removal",
    results: [codeExec, directTools],
    correctness: {
      finalReportsMatch: outputsMatch,
    },
    delta: {
      byteSavingsForCodeExec: directTools.totalMeasuredBytes - codeExec.totalMeasuredBytes,
      byteSavingsPercent: percentSaved(
        directTools.totalMeasuredBytes,
        codeExec.totalMeasuredBytes,
      ),
      additionalCallsForCodeExec:
        codeExec.toolCallCount - directTools.toolCallCount,
      toolSchemaByteSavings:
        directTools.schemaBytes - codeExec.schemaBytes,
      outputByteSavings:
        directTools.toolOutputBytes - codeExec.toolOutputBytes,
    },
  };

  await mkdir(path.join(root, "outputs"), { recursive: true });
  await writeFile(
    path.join(root, "outputs/benchmark-mcp-comparison.json"),
    `${JSON.stringify(comparison, null, 2)}\n`,
  );
  await writeFile(
    path.join(root, "outputs/benchmark-mcp-comparison.md"),
    renderMarkdown(comparison),
  );

  console.log(JSON.stringify(comparison, null, 2));
}

async function runCodeExecBenchmark(): Promise<BenchResult> {
  return withClient("src/mcp/server.ts", "code-exec", async (runner) => {
    const search = await runner.call("search_capabilities", {
      query: "java diff usage",
    });
    const definitions = await runner.call("get_type_definitions", {
      capabilities: [
        "gumtreeDiff",
        "findJavaCallSites",
        "oldSymbolsFrom",
        "jsonByteSize",
        "percentageReduction",
      ],
    });
    const executionEnvelope = await runner.call("execute_typescript", {
      code: codeExecProgram,
    });
    const execution = executionEnvelope.result;

    if (!execution || typeof execution !== "object") {
      throw new Error("Code-execution benchmark returned no result.");
    }

    return {
      finalResult: execution,
      finalResultForMeasurement: execution,
      metadata: {
        discoveryResultBytes: measureSize(search),
        typeDefinitionsLoadedBytes: measureSize(definitions),
      },
    };
  });
}

async function runDirectToolsBenchmark(): Promise<BenchResult> {
  return withClient("src/mcp/direct-tools-server.ts", "direct-tools", async (runner) => {
    const diff = await runner.call("gumtree_diff", {
      oldFile: benchmarkTask.oldFile,
      newFile: benchmarkTask.newFile,
    });
    const typedDiff = diff as unknown as GumTreeDiffResult;
    const usage = await runner.call("find_java_call_sites", {
      rootDirectory: benchmarkTask.appRoot,
      symbols: oldSymbolsFrom(typedDiff.changedSymbols),
    });
    const report = measureImpactReport(
      buildImpactReport(typedDiff, usage as unknown as UsageSearchResult),
      typedDiff.rawSizeBytes,
    );

    return {
      finalResult: report,
      finalResultForMeasurement: report,
    };
  });
}

async function withClient(
  serverFile: string,
  name: string,
  run: (runner: {
    call: (toolName: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  }) => Promise<{
    finalResult: unknown;
    finalResultForMeasurement: unknown;
    metadata?: Record<string, unknown>;
  }>,
): Promise<BenchResult> {
  const client = new Client({
    name: `${name}-benchmark-client`,
    version: "0.1.0",
  });
  const transport = new StdioClientTransport({
    command: path.join(root, "node_modules/.bin/tsx"),
    args: [serverFile],
    cwd: root,
    stderr: "pipe",
  });
  const startedAt = performance.now();
  const calls: ToolCallMetric[] = [];

  try {
    await client.connect(transport);
    const tools = await client.listTools();
    const schemaBytes = measureSize(tools.tools);

    async function call(toolName: string, args: Record<string, unknown>) {
      const callStartedAt = performance.now();
      const result = await client.callTool({
        name: toolName,
        arguments: args,
      });
      const structured =
        "structuredContent" in result && result.structuredContent
          ? result.structuredContent
          : result;

      calls.push({
        name: toolName,
        inputBytes: measureSize({ toolName, arguments: args }),
        outputBytes: measureSize(normalizeVolatileFields(structured)),
        durationMs: roundMs(performance.now() - callStartedAt),
      });

      return structured as Record<string, unknown>;
    }

    const { finalResult, finalResultForMeasurement, metadata } = await run({ call });
    const toolInputBytes = calls.reduce((sum, item) => sum + item.inputBytes, 0);
    const toolOutputBytes = calls.reduce((sum, item) => sum + item.outputBytes, 0);

    return {
      name,
      serverFile,
      listedToolCount: tools.tools.length,
      listedTools: tools.tools.map((tool) => tool.name),
      schemaBytes,
      toolInputBytes,
      toolOutputBytes,
      totalMeasuredBytes: schemaBytes + toolInputBytes + toolOutputBytes,
      toolCallCount: calls.length,
      durationMs: roundMs(performance.now() - startedAt),
      finalResultBytes: measureSize(finalResultForMeasurement),
      finalResult,
      ...(metadata ? { metadata } : {}),
      calls,
    };
  } finally {
    await client.close();
  }
}

function measureSize(value: unknown): number {
  return typeof value === "string" ? Buffer.byteLength(value, "utf8") : jsonByteSize(value);
}

function normalizeVolatileFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeVolatileFields);
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      key === "durationMs" ? 0 : normalizeVolatileFields(item),
    ]),
  );
}

function percentSaved(original: number, smaller: number): number {
  if (original <= 0) {
    return 0;
  }

  return Number((100 * (1 - smaller / original)).toFixed(2));
}

function roundMs(value: number): number {
  return Number(value.toFixed(2));
}

function renderMarkdown(comparison: {
  generatedAt: string;
  metric: string;
  scenario: string;
  results: BenchResult[];
  delta: {
    byteSavingsForCodeExec: number;
    byteSavingsPercent: number;
    additionalCallsForCodeExec: number;
    toolSchemaByteSavings: number;
    outputByteSavings: number;
  };
}): string {
  const [codeExec, directTools] = comparison.results;

  if (!codeExec || !directTools) {
    throw new Error("Expected exactly two benchmark results.");
  }

  return `# MCP Benchmark Comparison

Generated: ${comparison.generatedAt}

Metric: ${comparison.metric}

Scenario: ${comparison.scenario}

| Approach | Listed tools | MCP tool calls | Schema bytes | Input bytes | Output bytes | Total measured bytes | Final result bytes | Duration ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Code execution MCP | ${codeExec.listedToolCount} | ${codeExec.toolCallCount} | ${codeExec.schemaBytes} | ${codeExec.toolInputBytes} | ${codeExec.toolOutputBytes} | ${codeExec.totalMeasuredBytes} | ${codeExec.finalResultBytes} | ${codeExec.durationMs} |
| Direct tools MCP | ${directTools.listedToolCount} | ${directTools.toolCallCount} | ${directTools.schemaBytes} | ${directTools.toolInputBytes} | ${directTools.toolOutputBytes} | ${directTools.totalMeasuredBytes} | ${directTools.finalResultBytes} | ${directTools.durationMs} |

Code-execution protocol comparison:

- Total byte savings: ${comparison.delta.byteSavingsForCodeExec}
- Total byte savings percent: ${comparison.delta.byteSavingsPercent}%
- Additional code-execution calls (cold discovery included): ${comparison.delta.additionalCallsForCodeExec}
- Tool schema byte savings: ${comparison.delta.toolSchemaByteSavings}
- Tool output byte savings: ${comparison.delta.outputByteSavings}

Tools exposed by direct baseline:

${directTools.listedTools.map((tool) => `- \`${tool}\``).join("\n")}
`;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
