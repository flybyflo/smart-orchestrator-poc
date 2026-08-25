import { realpath, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

const { repoRoot } = config;
const { allowedInputRoots, maxFileBytes } = config.paths;

export interface ResolvedWorkspacePath {
  absolutePath: string;
  relativePath: string;
}

export async function resolveWorkspacePath(
  inputPath: string,
  options: {
    directory?: boolean;
    extension?: string;
  } = {},
): Promise<ResolvedWorkspacePath> {
  if (!inputPath || path.isAbsolute(inputPath)) {
    throw new Error(`Path must be relative to the workspace: ${inputPath}`);
  }

  const normalized = path.normalize(inputPath);

  if (
    normalized === ".." ||
    normalized.startsWith(`..${path.sep}`) ||
    normalized.includes(`${path.sep}..${path.sep}`)
  ) {
    throw new Error(`Path traversal is not allowed: ${inputPath}`);
  }

  if (!allowedInputRoots.some((root) => normalized === root || normalized.startsWith(`${root}${path.sep}`))) {
    throw new Error(
      `Path must be under one of ${allowedInputRoots.map((root) => `"${root}"`).join(", ")}: ${inputPath}`,
    );
  }

  if (options.extension && !normalized.endsWith(options.extension)) {
    throw new Error(`Path must end with ${options.extension}: ${inputPath}`);
  }

  const absolutePath = path.resolve(repoRoot, normalized);
  const realPath = await realpath(absolutePath);
  const relativeRealPath = path.relative(repoRoot, realPath);

  if (
    relativeRealPath.startsWith("..") ||
    path.isAbsolute(relativeRealPath) ||
    !allowedInputRoots.some((root) => relativeRealPath === root || relativeRealPath.startsWith(`${root}${path.sep}`))
  ) {
    throw new Error(`Resolved path escapes allowed roots: ${inputPath}`);
  }

  const stats = await stat(realPath);

  if (options.directory && !stats.isDirectory()) {
    throw new Error(`Expected directory path: ${inputPath}`);
  }

  if (!options.directory) {
    if (!stats.isFile()) {
      throw new Error(`Expected file path: ${inputPath}`);
    }

    if (stats.size > maxFileBytes) {
      throw new Error(`File exceeds ${maxFileBytes} byte limit: ${inputPath}`);
    }
  }

  return {
    absolutePath: realPath,
    relativePath: relativeRealPath,
  };
}

export async function readWorkspaceTextFile(
  inputPath: string,
  options: {
    extension?: string;
    signal?: AbortSignal;
  } = {},
): Promise<string> {
  throwIfAborted(options.signal);
  const resolved = await resolveWorkspacePath(inputPath, {
    ...(options.extension ? { extension: options.extension } : {}),
  });
  throwIfAborted(options.signal);
  return readFile(resolved.absolutePath, "utf8");
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("Operation aborted.");
  }
}
