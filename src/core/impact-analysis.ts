import { createAnalysis } from "../api.js";
import { jsonByteSize } from "../runtime.js";
import type {
  ImpactAnalysisInput,
  ImpactReport,
  MeasuredImpactReport,
  GumTreeDiffResult,
  UsageSearchResult,
  CodeChange,
  CallSite,
} from "../types.js";
import { oldSymbolsFrom, percentageReduction } from "../orchestrator/symbols.js";

export function buildImpactReport(
  diff: GumTreeDiffResult,
  usage: UsageSearchResult,
  options: { taskId?: string } = {},
): ImpactReport {
  return buildImpactReportFromParts({
    ...(options.taskId ? { taskId: options.taskId } : {}),
    adapter: diff.adapter,
    normalizationAdapter: diff.normalizationAdapter,
    changes: diff.changedSymbols,
    callSites: usage.callSites,
    warnings: diff.warnings,
  });
}

export function buildImpactReportFromParts(input: {
  taskId?: string;
  adapter: GumTreeDiffResult["adapter"];
  normalizationAdapter: GumTreeDiffResult["normalizationAdapter"];
  changes: CodeChange[];
  callSites: CallSite[];
  warnings: string[];
}): ImpactReport {
  return {
    ...(input.taskId ? { taskId: input.taskId } : {}),
    adapter: input.adapter,
    normalizationAdapter: input.normalizationAdapter,
    changedMethods: input.changes.map((change) => ({
      changeType: change.changeType,
      ...(change.oldSymbol ? { oldSymbol: change.oldSymbol.signature } : {}),
      ...(change.newSymbol ? { newSymbol: change.newSymbol.signature } : {}),
      summary: change.summary,
    })),
    affectedCallSites: input.callSites.map((site) => ({
      file: site.file,
      line: site.line,
      content: site.content,
      matchedSymbol: site.matchedSymbol.signature,
      ...(site.receiver ? { receiver: site.receiver } : {}),
      ...(site.receiverType ? { receiverType: site.receiverType } : {}),
      confidence: site.confidence,
      evidence: site.evidence,
    })),
    warnings: input.warnings,
  };
}

export function measureImpactReport(
  report: ImpactReport,
  rawDiffSizeBytes: number,
): MeasuredImpactReport {
  const compactSizeBytes = jsonByteSize(report);

  return {
    ...report,
    rawDiffSizeBytes,
    compactSizeBytes,
    reductionVsRawDiffPercent: percentageReduction(
      rawDiffSizeBytes,
      compactSizeBytes,
    ),
  };
}

export async function analyzeUpgrade(
  input: ImpactAnalysisInput,
  options: { signal?: AbortSignal } = {},
) {
  const analysis = createAnalysis(options);
  const diff = await analysis.gumtree.diff({
    oldFile: input.oldFile,
    newFile: input.newFile,
  });
  const usage = await analysis.usage.findJavaCallSites({
    rootDirectory: input.appRoot,
    symbols: oldSymbolsFrom(diff.changedSymbols),
  });
  const report = measureImpactReport(
    buildImpactReport(diff, usage, {
      ...(input.taskId ? { taskId: input.taskId } : {}),
    }),
    diff.rawSizeBytes,
  );

  return {
    report,
    diff,
    usage,
    telemetry: analysis.telemetry.snapshot(),
  };
}
