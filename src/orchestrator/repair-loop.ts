import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { executeTypeScript, type ExecuteTypeScriptResult } from "./execute.js";
import { generateImpactAnalysisCode } from "./program.js";

const root = config.repoRoot;

export interface ImpactAnalysisTask {
  id: string;
  oldFile: string;
  newFile: string;
  appRoot: string;
}

export interface RepairAttempt {
  attempt: number;
  code: string;
  ok: boolean;
  error?: string;
  resultSizeBytes?: number;
}

export interface RepairLoopResult {
  task: ImpactAnalysisTask;
  success: boolean;
  attempts: RepairAttempt[];
  final?: ExecuteTypeScriptResult;
}

export async function runImpactAnalysisRepairLoop(
  task: ImpactAnalysisTask,
  options: {
    maxAttempts?: number;
    seedUnsafeAttempt?: boolean;
  } = {},
): Promise<RepairLoopResult> {
  const maxAttempts = options.maxAttempts ?? config.repairLoop.maxAttempts;
  const attempts: RepairAttempt[] = [];
  let code = generateImpactAnalysisCode({
    oldFile: task.oldFile,
    newFile: task.newFile,
    appRoot: task.appRoot,
    taskId: task.id,
  }, {
    unsafeSizeHelper: options.seedUnsafeAttempt ?? false,
  });
  let final: ExecuteTypeScriptResult | undefined;

  for (let index = 1; index <= maxAttempts; index += 1) {
    const result = await executeTypeScript({ code });
    final = result;
    attempts.push({
      attempt: index,
      code,
      ok: result.ok,
      ...(result.error ? { error: result.error } : {}),
      ...(result.resultSizeBytes !== undefined
        ? { resultSizeBytes: result.resultSizeBytes }
        : {}),
    });

    if (result.ok) {
      return {
        task,
        success: true,
        attempts,
        final,
      };
    }

    const repaired = repairGeneratedCode(code, result.error ?? "");

    if (repaired === code) {
      break;
    }

    code = repaired;
  }

  return {
    task,
    success: false,
    attempts,
    ...(final ? { final } : {}),
  };
}

export function repairGeneratedCode(code: string, error: string): string {
  if (error.includes("Buffer")) {
    return code.replace(
      /Buffer\.byteLength\(JSON\.stringify\(([^)]+)\),\s*"utf8"\)/g,
      "await jsonByteSize({ value: $1 })",
    );
  }

  return code;
}

async function main(): Promise<void> {
  const task: ImpactAnalysisTask = {
    id: "parser-basic",
    oldFile: "fixtures/v1/library/Parser.java",
    newFile: "fixtures/v2/library/Parser.java",
    appRoot: "fixtures/app",
  };
  const result = await runImpactAnalysisRepairLoop(task, {
    seedUnsafeAttempt: true,
  });
  const outputPath = path.join(root, "outputs/orchestrator-repair-loop.json");

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);

  console.log(JSON.stringify(result, null, 2));

  if (!result.success) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
