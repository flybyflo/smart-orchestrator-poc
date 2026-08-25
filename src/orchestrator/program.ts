import type { ImpactAnalysisInput } from "../types.js";

export function generateImpactAnalysisCode(
  task: ImpactAnalysisInput,
  options: { unsafeSizeHelper?: boolean } = {},
): string {
  const compactSizeExpression = options.unsafeSizeHelper
    ? "Buffer.byteLength(JSON.stringify(compact), \"utf8\")"
    : "await jsonByteSize({ value: compact })";

  return `
const diff = await gumtreeDiff({
  oldFile: ${JSON.stringify(task.oldFile)},
  newFile: ${JSON.stringify(task.newFile)},
});

const symbols = await oldSymbolsFrom({ changes: diff.changedSymbols });
const usage = await findJavaCallSites({
  rootDirectory: ${JSON.stringify(task.appRoot)},
  symbols,
});

const compact = {
  ${task.taskId ? `taskId: ${JSON.stringify(task.taskId)},` : ""}
  adapter: diff.adapter,
  normalizationAdapter: diff.normalizationAdapter,
  changedMethods: diff.changedSymbols.map((change) => ({
    changeType: change.changeType,
    ...(change.oldSymbol ? { oldSymbol: change.oldSymbol.signature } : {}),
    ...(change.newSymbol ? { newSymbol: change.newSymbol.signature } : {}),
    summary: change.summary,
  })),
  affectedCallSites: usage.callSites.map((site) => ({
    file: site.file,
    line: site.line,
    content: site.content,
    matchedSymbol: site.matchedSymbol.signature,
    ...(site.receiver ? { receiver: site.receiver } : {}),
    ...(site.receiverType ? { receiverType: site.receiverType } : {}),
    confidence: site.confidence,
    evidence: site.evidence,
  })),
  warnings: diff.warnings,
};

const compactSizeBytes = ${compactSizeExpression};

return {
  ...compact,
  rawDiffSizeBytes: diff.rawSizeBytes,
  compactSizeBytes,
  reductionVsRawDiffPercent: await percentageReduction({
    originalBytes: diff.rawSizeBytes,
    compactBytes: compactSizeBytes,
  }),
};
`;
}
