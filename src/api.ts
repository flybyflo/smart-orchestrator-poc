import { createTelemetryRecorder, instrumentTool } from "./runtime.js";
import { gumtreeDiff } from "./tools/gumtree.js";
import { findJavaCallSites } from "./tools/usage.js";
import type { GumTreeDiffInput, UsageSearchInput } from "./types.js";

export function createAnalysis(options: { signal?: AbortSignal } = {}) {
  const signalOptions = options.signal ? { signal: options.signal } : {};
  const telemetry = createTelemetryRecorder();

  return {
    telemetry,
    gumtree: {
      diff(input: GumTreeDiffInput) {
        return instrumentTool(
          telemetry,
          "analysis.gumtree.diff",
          input,
          () => gumtreeDiff(input, signalOptions),
          signalOptions,
        );
      },
    },
    usage: {
      findJavaCallSites(input: UsageSearchInput) {
        return instrumentTool(
          telemetry,
          "analysis.usage.findJavaCallSites",
          input,
          () => findJavaCallSites(input, signalOptions),
          signalOptions,
        );
      },
    },
  };
}
