import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { config } from "../config.js";
import { compareJavaMethodSignatures } from "./method-signatures.js";
import { resolveWorkspacePath, throwIfAborted } from "./paths.js";
import type {
  GumTreeDiffInput,
  GumTreeDiffResult,
} from "../types.js";

const execFileAsync = promisify(execFile);

export async function gumtreeDiff(
  input: GumTreeDiffInput,
  options: {
    signal?: AbortSignal;
  } = {},
): Promise<GumTreeDiffResult> {
  throwIfAborted(options.signal);
  const oldFile = await resolveWorkspacePath(input.oldFile, { extension: ".java" });
  const newFile = await resolveWorkspacePath(input.newFile, { extension: ".java" });
  const executable = requireGumTreeWrapper();

  throwIfAborted(options.signal);

  let stdout: string;

  try {
    ({ stdout } = await execFileAsync(
      executable,
      ["textdiff", "-f", "JSON", oldFile.absolutePath, newFile.absolutePath],
      {
        maxBuffer: config.gumtree.maxBufferBytes,
        timeout: config.gumtree.timeoutMs,
        ...(options.signal ? { signal: options.signal } : {}),
      },
    ));
  } catch (error) {
    throw new Error(`GumTree failed: ${formatError(error)}`, { cause: error });
  }

  let raw: unknown;

  try {
    raw = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`GumTree returned invalid JSON: ${formatError(error)}`, {
      cause: error,
    });
  }

  const changedSymbols = await compareJavaMethodSignatures(input, options);

  return {
    adapter: "gumtree",
    normalizationAdapter: "java-source-signatures",
    oldFile: input.oldFile,
    newFile: input.newFile,
    raw,
    rawSizeBytes: Buffer.byteLength(JSON.stringify(raw), "utf8"),
    changedSymbols,
    warnings: [],
  };
}

function requireGumTreeWrapper(): string {
  const wrapper = config.gumtree.wrapperPath;

  if (!existsSync(wrapper)) {
    throw new Error(
      `GumTree wrapper not found at ${wrapper}. Keep tools/gumtree-cli in the repo and ensure Java + Maven are installed.`,
    );
  }

  return wrapper;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
