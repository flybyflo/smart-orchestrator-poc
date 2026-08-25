import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outputsDir = path.join(root, "outputs");
const codexBinary = process.env.CODEX_CLI ?? "codex";
const tsxBinary = path.join(root, "node_modules/.bin/tsx");

interface Usage {
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  reasoning_output_tokens: number;
}

interface WorkspaceSpec {
  id: string;
  label: string;
  server: string;
  serverFile: string;
  workspace: string;
}

interface CodexRunResult {
  id: string;
  label: string;
  server: string;
  workspace: string;
  durationMs: number;
  exitCode: number | null;
  threadId: string | null;
  usage: Usage;
  inputPlusOutputTokens: number;
  nonCachedInputTokens: number;
  completedNonMessageItems: number;
  stdoutPath: string;
  stderrPath: string;
  finalMessagePath: string;
  finalMessagePreview: string;
}

const sharedPrompt = `Analyze the dependency upgrade impact for this Java fixture:

- old library file: fixtures/v1/library/Parser.java
- new library file: fixtures/v2/library/Parser.java
- application root: fixtures/app

Use the available MCP tools only. Do not run shell commands and do not read files directly outside MCP.

Return only compact JSON. The JSON should include the diff adapter, changed methods, affected application call sites, warnings, and any payload-size or reduction fields that the available MCP workflow can produce.`;

const workspaces: WorkspaceSpec[] = [
  {
    id: "code-exec",
    label: "Code execution MCP",
    server: "smart_orchestrator_code_exec",
    serverFile: path.join(root, "src/mcp/server.ts"),
    workspace: path.join(root, "benchmarks/agent-workspaces/code-exec"),
  },
  {
    id: "direct-tools",
    label: "Direct many-tools MCP",
    server: "smart_orchestrator_direct_tools",
    serverFile: path.join(root, "src/mcp/direct-tools-server.ts"),
    workspace: path.join(root, "benchmarks/agent-workspaces/direct-tools"),
  },
];

async function main(): Promise<void> {
  await mkdir(outputsDir, { recursive: true });

  const results: CodexRunResult[] = [];
  for (const workspace of workspaces) {
    console.error(`Running same-prompt benchmark for ${workspace.label}...`);
    results.push(await runCodexExec(workspace));
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    command: codexBinary,
    prompt: sharedPrompt,
    note:
      "Both runs use the exact same initial prompt. The only intended differences are the workspace AGENTS.md guidance and the single MCP server enabled for that workspace. The run uses Codex read-only shell sandboxing; MCP-only behavior is verified from the JSONL tool sequence.",
    results,
    delta: {
      inputPlusOutputTokenSavings:
        results[1]!.inputPlusOutputTokens - results[0]!.inputPlusOutputTokens,
      inputPlusOutputSavingsPercent: percentSaved(
        results[1]!.inputPlusOutputTokens,
        results[0]!.inputPlusOutputTokens,
      ),
      inputTokenSavings: results[1]!.usage.input_tokens - results[0]!.usage.input_tokens,
      outputTokenSavings: results[1]!.usage.output_tokens - results[0]!.usage.output_tokens,
      reasoningOutputTokenSavings:
        results[1]!.usage.reasoning_output_tokens -
        results[0]!.usage.reasoning_output_tokens,
    },
  };

  await writeFile(
    path.join(outputsDir, "codex-exec-same-prompt-summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  await writeFile(
    path.join(outputsDir, "codex-exec-same-prompt-summary.md"),
    renderMarkdown(summary),
  );

  console.log(JSON.stringify(summary, null, 2));
}

async function runCodexExec(workspace: WorkspaceSpec): Promise<CodexRunResult> {
  const stdoutPath = path.join(outputsDir, `codex-exec-same-prompt-${workspace.id}.jsonl`);
  const stderrPath = path.join(outputsDir, `codex-exec-same-prompt-${workspace.id}.stderr.log`);
  const finalMessagePath = path.join(outputsDir, `codex-exec-same-prompt-${workspace.id}.final.txt`);
  const args = [
    "exec",
    "--json",
    "--ephemeral",
    "--ignore-user-config",
    "--skip-git-repo-check",
    "-C",
    workspace.workspace,
    "-c",
    'approval_policy="never"',
    "-s",
    "read-only",
    "-o",
    finalMessagePath,
    ...serverConfigArgs(workspace),
    sharedPrompt,
  ];
  const startedAt = performance.now();
  const { exitCode, stdout, stderr } = await spawnBuffered(codexBinary, args, workspace.workspace);

  await writeFile(stdoutPath, stdout);
  await writeFile(stderrPath, stderr);

  const parsed = parseCodexJsonl(stdout);
  const finalMessage = await readOptional(finalMessagePath);

  if (exitCode !== 0) {
    throw new Error(
      `${workspace.label} failed with exit ${exitCode}.\n${stderr.slice(-4_000)}`,
    );
  }

  if (!parsed.usage) {
    throw new Error(`${workspace.label} did not emit turn.completed.usage.`);
  }

  return {
    id: workspace.id,
    label: workspace.label,
    server: workspace.server,
    workspace: workspace.workspace,
    durationMs: roundMs(performance.now() - startedAt),
    exitCode,
    threadId: parsed.threadId,
    usage: parsed.usage,
    inputPlusOutputTokens: parsed.usage.input_tokens + parsed.usage.output_tokens,
    nonCachedInputTokens:
      parsed.usage.input_tokens - parsed.usage.cached_input_tokens,
    completedNonMessageItems: parsed.completedNonMessageItems.length,
    stdoutPath,
    stderrPath,
    finalMessagePath,
    finalMessagePreview: finalMessage.trim().slice(0, 1_000),
  };
}

function serverConfigArgs(workspace: WorkspaceSpec): string[] {
  return [
    "-c",
    `mcp_servers.${workspace.server}.command=${tomlString(tsxBinary)}`,
    "-c",
    `mcp_servers.${workspace.server}.args=[${tomlString(workspace.serverFile)}]`,
    "-c",
    `mcp_servers.${workspace.server}.cwd=${tomlString(root)}`,
    "-c",
    `mcp_servers.${workspace.server}.enabled=true`,
    "-c",
    `mcp_servers.${workspace.server}.startup_timeout_sec=300`,
    "-c",
    `mcp_servers.${workspace.server}.tool_timeout_sec=300`,
  ];
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function spawnBuffered(
  command: string,
  args: string[],
  cwd: string,
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        NO_COLOR: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({ exitCode, stdout, stderr });
    });
  });
}

function parseCodexJsonl(stdout: string): {
  threadId: string | null;
  usage: Usage | null;
  completedNonMessageItems: Array<{ type: string }>;
} {
  let threadId: string | null = null;
  let usage: Usage | null = null;
  const completedNonMessageItems: Array<{ type: string }> = [];

  for (const line of stdout.split("\n")) {
    if (!line.trim()) {
      continue;
    }

    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }

    if (!isRecord(event)) {
      continue;
    }

    if (event.type === "thread.started" && typeof event.thread_id === "string") {
      threadId = event.thread_id;
    }

    if (event.type === "turn.completed" && isUsage(event.usage)) {
      usage = event.usage;
    }

    if (event.type === "item.completed" && isRecord(event.item)) {
      const itemType = typeof event.item.type === "string" ? event.item.type : "unknown";
      if (itemType !== "agent_message") {
        completedNonMessageItems.push({ type: itemType });
      }
    }
  }

  return { threadId, usage, completedNonMessageItems };
}

function isUsage(value: unknown): value is Usage {
  return (
    isRecord(value) &&
    typeof value.input_tokens === "number" &&
    typeof value.cached_input_tokens === "number" &&
    typeof value.output_tokens === "number" &&
    typeof value.reasoning_output_tokens === "number"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function readOptional(file: string): Promise<string> {
  try {
    return await readFile(file, "utf8");
  } catch {
    return "";
  }
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

function renderMarkdown(summary: {
  generatedAt: string;
  command: string;
  prompt: string;
  note: string;
  results: CodexRunResult[];
  delta: {
    inputPlusOutputTokenSavings: number;
    inputPlusOutputSavingsPercent: number;
    inputTokenSavings: number;
    outputTokenSavings: number;
    reasoningOutputTokenSavings: number;
  };
}): string {
  return `# Codex Exec Same-Prompt Token Benchmark

Generated: ${summary.generatedAt}

Command: \`${summary.command} exec --json\`

${summary.note}

## Shared Prompt

\`\`\`text
${summary.prompt}
\`\`\`

| Approach | Server | Workspace | Input tokens | Cached input | Non-cached input | Output tokens | Reasoning output | Input + output | Non-message completed items | Duration ms |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
${summary.results
  .map(
    (result) =>
      `| ${result.label} | \`${result.server}\` | \`${path.relative(root, result.workspace)}\` | ${result.usage.input_tokens} | ${result.usage.cached_input_tokens} | ${result.nonCachedInputTokens} | ${result.usage.output_tokens} | ${result.usage.reasoning_output_tokens} | ${result.inputPlusOutputTokens} | ${result.completedNonMessageItems} | ${result.durationMs} |`,
  )
  .join("\n")}

Code-execution MCP savings against the direct many-tools MCP:

- Input + output token savings: ${summary.delta.inputPlusOutputTokenSavings}
- Input + output savings percent: ${summary.delta.inputPlusOutputSavingsPercent}%
- Input token savings: ${summary.delta.inputTokenSavings}
- Output token savings: ${summary.delta.outputTokenSavings}
- Reasoning output token savings: ${summary.delta.reasoningOutputTokenSavings}

Artifacts:

- \`outputs/codex-exec-same-prompt-code-exec.jsonl\`
- \`outputs/codex-exec-same-prompt-code-exec.final.txt\`
- \`outputs/codex-exec-same-prompt-direct-tools.jsonl\`
- \`outputs/codex-exec-same-prompt-direct-tools.final.txt\`
`;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
