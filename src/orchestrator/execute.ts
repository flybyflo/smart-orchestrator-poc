import { stripTypeScript } from "@tanstack/ai-code-mode";
import type { IsolateContext, IsolateDriver } from "@tanstack/ai-code-mode";
import { createNodeIsolateDriver } from "@tanstack/ai-isolate-node";
import { config } from "../config.js";
import { createTelemetryRecorder, jsonByteSize } from "../runtime.js";
import type { ToolCallRecord } from "../types.js";
import { createSandboxBindings } from "./bindings.js";

export interface ExecuteTypeScriptInput {
  code: string;
}

export interface ExecuteTypeScriptResult {
  ok: boolean;
  result?: unknown;
  resultSizeBytes?: number;
  telemetry: ToolCallRecord[];
  logs?: string[];
  sandbox: SandboxMetadata;
  error?: string;
}

export const MAX_CODE_BYTES = config.sandbox.maxCodeBytes;

export interface SandboxMetadata {
  engine: "isolated-vm";
  driver: "@tanstack/ai-isolate-node";
  memoryLimitMb: number;
  maxCodeBytes: number;
  timeoutMs: number;
  outputLimitBytes: number;
}

let driver: IsolateDriver | undefined;

function getDriver(): IsolateDriver {
  driver ??= createNodeIsolateDriver({
    memoryLimit: config.sandbox.memoryLimitMb,
    timeout: config.sandbox.timeoutMs,
  });

  return driver;
}

export async function executeTypeScript({
  code,
}: ExecuteTypeScriptInput): Promise<ExecuteTypeScriptResult> {
  const telemetry = createTelemetryRecorder();
  const { timeoutMs, outputLimitBytes, memoryLimitMb, maxCodeBytes } = config.sandbox;
  const sandbox = sandboxMetadata();
  const abortController = new AbortController();
  let context: IsolateContext | undefined;
  let logs: string[] = [];

  try {
    validateCodeSize(code, maxCodeBytes);
    const javascript = await stripTypeScript(code);
    context = await getDriver().createContext({
      bindings: createSandboxBindings({
        signal: abortController.signal,
        telemetry,
      }),
      timeout: timeoutMs,
      memoryLimit: memoryLimitMb,
    });

    const execution = await withTimeout(
      context.execute(javascript),
      timeoutMs,
      abortController,
    );
    logs = execution.logs ?? [];

    if (!execution.success) {
      return {
        ok: false,
        error: formatNormalizedError(execution.error),
        telemetry: telemetry.snapshot(),
        logs,
        sandbox,
      };
    }

    const resultSizeBytes = jsonByteSize(execution.value);

    if (resultSizeBytes > outputLimitBytes) {
      throw new Error(
        `Result is ${resultSizeBytes} bytes, exceeding output limit of ${outputLimitBytes} bytes.`,
      );
    }

    return {
      ok: true,
      result: execution.value,
      resultSizeBytes,
      telemetry: telemetry.snapshot(),
      logs,
      sandbox,
    };
  } catch (error) {
    return {
      ok: false,
      error: formatError(error),
      telemetry: telemetry.snapshot(),
      logs,
      sandbox,
    };
  } finally {
    await context?.dispose();
  }
}

function sandboxMetadata(): SandboxMetadata {
  return {
    engine: "isolated-vm",
    driver: "@tanstack/ai-isolate-node",
    memoryLimitMb: config.sandbox.memoryLimitMb,
    maxCodeBytes: config.sandbox.maxCodeBytes,
    timeoutMs: config.sandbox.timeoutMs,
    outputLimitBytes: config.sandbox.outputLimitBytes,
  };
}

function validateCodeSize(code: string, maxCodeBytes: number): void {
  const codeBytes = Buffer.byteLength(code, "utf8");

  if (codeBytes > maxCodeBytes) {
    throw new Error(
      `Generated code is ${codeBytes} bytes, exceeding limit of ${maxCodeBytes} bytes.`,
    );
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  abortController: AbortController,
): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          abortController.abort();
          reject(new Error(`Execution exceeded timeout of ${timeoutMs} ms.`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function formatNormalizedError(
  error: { name: string; message: string } | undefined,
): string {
  if (!error) {
    return "Execution failed without error details.";
  }

  return error.name && error.name !== "Error"
    ? `${error.name}: ${error.message}`
    : error.message;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
