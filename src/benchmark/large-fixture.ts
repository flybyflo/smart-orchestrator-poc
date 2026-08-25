import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildImpactReportFromParts } from "../core/impact-analysis.js";
import { oldSymbolsFrom, percentageReduction } from "../orchestrator/symbols.js";
import { jsonByteSize } from "../runtime.js";
import { gumtreeDiff } from "../tools/gumtree.js";
import { findJavaCallSites } from "../tools/usage.js";
import type { CodeChange, JavaSymbol } from "../types.js";
import { loadBenchmarkFixture } from "./fixtures.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function main(): Promise<void> {
  const fixtureId = process.argv[2] ?? "order-platform-large";
  const fixture = await loadBenchmarkFixture(fixtureId);

  const diffs = [];
  const changedSymbols: CodeChange[] = [];

  for (const pair of fixture.libraryPairs) {
    const diff = await gumtreeDiff(pair);
    diffs.push(diff);
    changedSymbols.push(...diff.changedSymbols);
  }

  const searchSymbols = uniqueSymbols(oldSymbolsFrom(changedSymbols));
  const usage = await findJavaCallSites({
    rootDirectory: fixture.appRoot,
    symbols: searchSymbols,
  });
  const compact = buildImpactReportFromParts({
    taskId: fixture.id,
    adapter: "gumtree",
    normalizationAdapter: "java-source-signatures",
    changes: changedSymbols,
    callSites: usage.callSites,
    warnings: diffs.flatMap((diff) => diff.warnings),
  });
  const rawPayload = {
    diffs: diffs.map((diff) => diff.raw),
    changedSymbols,
    usage,
  };
  const compactBytes = jsonByteSize(compact);
  const rawBytes = jsonByteSize(rawPayload);
  const correctness = fixture.expected
    ? compareWithExpected(fixture.expected, changedSymbols, usage.callSites)
    : undefined;
  const result = {
    fixtureId: fixture.id,
    scenario: fixture.scenario,
    libraryPairCount: fixture.libraryPairs.length,
    changedMethodCount: changedSymbols.length,
    affectedCallSiteCount: usage.callSites.length,
    ...(fixture.expected
      ? {
          expected: {
            changedMethodCount: fixture.expected.changedMethods.length,
            affectedCallSiteCount: fixture.expected.affectedCallSites.length,
          },
        }
      : {}),
    ...(correctness ? { correctness } : {}),
    rawPayloadBytes: rawBytes,
    compactPayloadBytes: compactBytes,
    reductionPercent: percentageReduction(rawBytes, compactBytes),
    compact,
  };
  const outputPath = path.join(root, `outputs/benchmark-${fixture.id}.json`);
  const markdownPath = path.join(root, `outputs/benchmark-${fixture.id}.md`);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  await writeFile(markdownPath, renderMarkdown(result));
  console.log(JSON.stringify(result, null, 2));

  if (
    result.correctness && !result.correctness.exactMatch
  ) {
    process.exitCode = 1;
  }
}

function compareWithExpected(
  expected: NonNullable<Awaited<ReturnType<typeof loadBenchmarkFixture>>["expected"]>,
  changes: CodeChange[],
  callSites: Awaited<ReturnType<typeof findJavaCallSites>>["callSites"],
) {
  const expectedChanges = expected.changedMethods.map(changedMethodKey);
  const actualChanges = changes.map((change) =>
    changedMethodKey({
      changeType: change.changeType,
      ...(change.oldSymbol ? { oldSymbol: change.oldSymbol.signature } : {}),
      ...(change.newSymbol ? { newSymbol: change.newSymbol.signature } : {}),
    }),
  );
  const expectedSites = expected.affectedCallSites.map(callSiteKey);
  const actualSites = callSites.map((site) =>
    callSiteKey({
      file: site.file,
      line: site.line,
      matchedSymbol: site.matchedSymbol.signature,
    }),
  );
  const changedMethods = evaluateSet(expectedChanges, actualChanges);
  const affectedCallSites = evaluateSet(expectedSites, actualSites);

  return {
    exactMatch:
      changedMethods.missing.length === 0 &&
      changedMethods.unexpected.length === 0 &&
      affectedCallSites.missing.length === 0 &&
      affectedCallSites.unexpected.length === 0,
    changedMethods,
    affectedCallSites,
  };
}

function changedMethodKey(change: {
  changeType: string;
  oldSymbol?: string | undefined;
  newSymbol?: string | undefined;
}): string {
  return [change.changeType, change.oldSymbol ?? "", change.newSymbol ?? ""].join("|");
}

function callSiteKey(site: {
  file: string;
  line: number;
  matchedSymbol: string;
}): string {
  return `${site.file}:${site.line}|${site.matchedSymbol}`;
}

function evaluateSet(expected: string[], actual: string[]) {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  const truePositives = actual.filter((value) => expectedSet.has(value)).length;
  const precision = actual.length === 0 ? (expected.length === 0 ? 1 : 0) : truePositives / actual.length;
  const recall = expected.length === 0 ? 1 : truePositives / expected.length;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

  return {
    expected: expected.length,
    actual: actual.length,
    truePositives,
    precision: roundScore(precision),
    recall: roundScore(recall),
    f1: roundScore(f1),
    missing: expected.filter((value) => !actualSet.has(value)),
    unexpected: actual.filter((value) => !expectedSet.has(value)),
  };
}

function roundScore(value: number): number {
  return Number(value.toFixed(4));
}

function uniqueSymbols(symbols: JavaSymbol[]): JavaSymbol[] {
  return [...new Map(symbols.map((symbol) => [symbol.signature, symbol])).values()];
}

function renderMarkdown(result: {
  fixtureId: string;
  scenario: string;
  libraryPairCount: number;
  changedMethodCount: number;
  affectedCallSiteCount: number;
  expected?: {
    changedMethodCount: number;
    affectedCallSiteCount: number;
  };
  correctness?: {
    exactMatch: boolean;
    changedMethods: {
      precision: number;
      recall: number;
      f1: number;
    };
    affectedCallSites: {
      precision: number;
      recall: number;
      f1: number;
    };
  };
  rawPayloadBytes: number;
  compactPayloadBytes: number;
  reductionPercent: number;
}): string {
  return `# Large Fixture Benchmark

Fixture: \`${result.fixtureId}\`

Scenario: ${result.scenario}

| Library pairs | Changed methods | Expected changed | Affected call sites | Expected call sites | Raw bytes | Compact bytes | Reduction |
|---:|---:|---:|---:|---:|---:|---:|---:|
| ${result.libraryPairCount} | ${result.changedMethodCount} | ${result.expected?.changedMethodCount ?? "n/a"} | ${result.affectedCallSiteCount} | ${result.expected?.affectedCallSiteCount ?? "n/a"} | ${result.rawPayloadBytes} | ${result.compactPayloadBytes} | ${result.reductionPercent}% |

Correctness:

- Exact changed methods and call sites match: ${result.correctness?.exactMatch ?? "n/a"}
- Changed methods P/R/F1: ${formatScores(result.correctness?.changedMethods)}
- Affected call sites P/R/F1: ${formatScores(result.correctness?.affectedCallSites)}
`;
}

function formatScores(scores: {
  precision: number;
  recall: number;
  f1: number;
} | undefined): string {
  return scores
    ? `${scores.precision}/${scores.recall}/${scores.f1}`
    : "n/a";
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
