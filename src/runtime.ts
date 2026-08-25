import { performance } from "node:perf_hooks";
import type { ToolCallRecord } from "./types.js";

export interface TelemetryRecorder {
  record(call: ToolCallRecord): void;
  snapshot(): ToolCallRecord[];
}

export function createTelemetryRecorder(): TelemetryRecorder {
  const toolCalls: ToolCallRecord[] = [];

  return {
    record(call) {
      toolCalls.push(call);
    },
    snapshot() {
      return [...toolCalls];
    },
  };
}

export async function instrumentTool<T>(
  telemetry: TelemetryRecorder,
  name: string,
  input: unknown,
  action: () => Promise<T>,
  options: {
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  throwIfAborted(options.signal);
  const startedAt = performance.now();
  const output = await action();
  throwIfAborted(options.signal);
  const durationMs = performance.now() - startedAt;

  telemetry.record({
    name,
    durationMs: Number(durationMs.toFixed(2)),
    inputSizeBytes: jsonByteSize(input),
    outputSizeBytes: jsonByteSize(output),
  });

  return output;
}

export function jsonByteSize(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("Operation aborted.");
  }
}
