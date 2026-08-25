import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Single runtime config for the PoC.
 * No env overrides or per-call knobs — install deps, run scripts, this is it.
 */
export const config = {
  project: {
    name: "smart-orchestrator-poc",
    version: "0.1.0",
  },
  repoRoot,
  paths: {
    allowedInputRoots: ["fixtures"],
    maxFileBytes: 512 * 1024,
  },
  gumtree: {
    wrapperPath: path.join(repoRoot, "tools/gumtree-cli/gumtree"),
    timeoutMs: 30_000,
    maxBufferBytes: 10 * 1024 * 1024,
  },
  sandbox: {
    timeoutMs: 5_000,
    memoryLimitMb: 128,
    maxCodeBytes: 50_000,
    outputLimitBytes: 100_000,
  },
  repairLoop: {
    maxAttempts: 3,
  },
} as const;
