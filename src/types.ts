export interface SourceLocation {
  file: string;
  line: number;
}

export interface JavaSymbol {
  owner: string;
  name: string;
  parameterTypes: string[];
  returnType?: string | undefined;
  signature: string;
}

export type ChangeType =
  | "method_signature_changed"
  | "method_added"
  | "method_removed";

export interface CodeChange {
  changeType: ChangeType;
  element: "method";
  oldSymbol?: JavaSymbol | undefined;
  newSymbol?: JavaSymbol | undefined;
  oldDeclaration?: string | undefined;
  newDeclaration?: string | undefined;
  oldLocation?: SourceLocation | undefined;
  newLocation?: SourceLocation | undefined;
  summary: string;
}

export interface GumTreeDiffInput {
  oldFile: string;
  newFile: string;
}

export interface GumTreeDiffResult {
  adapter: "gumtree";
  normalizationAdapter: "java-source-signatures";
  oldFile: string;
  newFile: string;
  raw: unknown;
  rawSizeBytes: number;
  changedSymbols: CodeChange[];
  warnings: string[];
}

export interface CallSite {
  file: string;
  line: number;
  content: string;
  matchedSymbol: JavaSymbol;
  receiver?: string | undefined;
  receiverType?: string | undefined;
  argumentCount?: number | undefined;
  confidence: "high" | "medium" | "low";
  evidence: string;
}

export interface UsageSearchInput {
  rootDirectory: string;
  symbols: JavaSymbol[];
}

export interface UsageSearchResult {
  callSites: CallSite[];
  scannedFiles: number;
  searchedSymbols: JavaSymbol[];
}

export interface ToolCallRecord {
  name: string;
  durationMs: number;
  inputSizeBytes: number;
  outputSizeBytes: number;
}

export interface ImpactAnalysisInput extends GumTreeDiffInput {
  appRoot: string;
  taskId?: string | undefined;
}

export interface ChangedMethodSummary {
  changeType: ChangeType;
  oldSymbol?: string | undefined;
  newSymbol?: string | undefined;
  summary: string;
}

export interface AffectedCallSiteSummary {
  file: string;
  line: number;
  content: string;
  matchedSymbol: string;
  receiver?: string | undefined;
  receiverType?: string | undefined;
  confidence: CallSite["confidence"];
  evidence: string;
}

export interface ImpactReport {
  taskId?: string | undefined;
  adapter: GumTreeDiffResult["adapter"];
  normalizationAdapter: GumTreeDiffResult["normalizationAdapter"];
  changedMethods: ChangedMethodSummary[];
  affectedCallSites: AffectedCallSiteSummary[];
  warnings: string[];
}

export interface MeasuredImpactReport extends ImpactReport {
  rawDiffSizeBytes: number;
  compactSizeBytes: number;
  reductionVsRawDiffPercent: number;
}
