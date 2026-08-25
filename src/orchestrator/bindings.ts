import type { ToolBinding } from "@tanstack/ai-code-mode";
import { z } from "zod";
import {
  createTelemetryRecorder,
  instrumentTool,
  jsonByteSize,
  type TelemetryRecorder,
} from "../runtime.js";
import { codeChangeSchema, javaSymbolSchema } from "../schemas.js";
import { gumtreeDiff } from "../tools/gumtree.js";
import { findJavaCallSites } from "../tools/usage.js";
import { oldSymbolsFrom, percentageReduction } from "./symbols.js";

interface CapabilityContext {
  signal?: AbortSignal;
  telemetry: TelemetryRecorder;
}

export interface SandboxCapability {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  typeStub: string;
  invoke(input: unknown, context: CapabilityContext): Promise<unknown>;
}

function defineCapability<I>(spec: {
  name: string;
  title: string;
  description: string;
  schema: z.ZodType<I>;
  typeStub: string;
  execute(input: I, context: CapabilityContext): Promise<unknown>;
}): SandboxCapability {
  return {
    name: spec.name,
    title: spec.title,
    description: spec.description,
    inputSchema: z.toJSONSchema(spec.schema),
    typeStub: spec.typeStub,
    async invoke(input, context) {
      return spec.execute(spec.schema.parse(input), context);
    },
  };
}

export const sharedTypeDefinitions = `interface JavaSymbol {
  owner: string;
  name: string;
  parameterTypes: string[];
  returnType?: string;
  signature: string;
}

interface CodeChange {
  changeType: "method_signature_changed" | "method_added" | "method_removed";
  element: "method";
  oldSymbol?: JavaSymbol;
  newSymbol?: JavaSymbol;
  summary: string;
}

interface CallSite {
  file: string;
  line: number;
  content: string;
  matchedSymbol: JavaSymbol;
  receiver?: string;
  receiverType?: string;
  confidence: "high" | "medium" | "low";
  evidence: string;
}`;

export const sandboxCapabilities: SandboxCapability[] = [
  defineCapability({
    name: "gumtreeDiff",
    title: "Diff Java library versions",
    description:
      "Runs a structural GumTree diff and independently compares parsed Java method signatures for API-impact analysis. Both stages must succeed; no heuristic fallback is used.",
    schema: z.object({
      oldFile: z.string().min(1),
      newFile: z.string().min(1),
    }),
    typeStub: `declare function gumtreeDiff(input: {
  oldFile: string;
  newFile: string;
}): Promise<{
  adapter: "gumtree";
  normalizationAdapter: "java-source-signatures";
  oldFile: string;
  newFile: string;
  raw: unknown;
  rawSizeBytes: number;
  changedSymbols: CodeChange[];
  warnings: string[];
}>;`,
    execute: (input, context) => {
      const signalOptions = context.signal ? { signal: context.signal } : {};
      return instrumentTool(
        context.telemetry,
        "gumtreeDiff",
        input,
        () => gumtreeDiff(input, signalOptions),
        signalOptions,
      );
    },
  }),
  defineCapability({
    name: "findJavaCallSites",
    title: "Find Java call sites",
    description:
      "Finds Java source call sites for normalized method symbols using receiver and argument-count evidence.",
    schema: z.object({
      rootDirectory: z.string().min(1),
      symbols: z.array(javaSymbolSchema),
    }),
    typeStub: `declare function findJavaCallSites(input: {
  rootDirectory: string;
  symbols: JavaSymbol[];
}): Promise<{
  callSites: CallSite[];
  scannedFiles: number;
  searchedSymbols: JavaSymbol[];
}>;`,
    execute: (input, context) => {
      const signalOptions = context.signal ? { signal: context.signal } : {};
      return instrumentTool(
        context.telemetry,
        "findJavaCallSites",
        input,
        () => findJavaCallSites(input, signalOptions),
        signalOptions,
      );
    },
  }),
  defineCapability({
    name: "oldSymbolsFrom",
    title: "Extract old symbols from changes",
    description:
      "Deduplicates the old (or new, when no old symbol exists) Java symbols for call-site search.",
    schema: z.object({ changes: z.array(codeChangeSchema) }),
    typeStub: `declare function oldSymbolsFrom(input: {
  changes: CodeChange[];
}): Promise<JavaSymbol[]>;`,
    execute: (input) => Promise.resolve(oldSymbolsFrom(input.changes)),
  }),
  defineCapability({
    name: "jsonByteSize",
    title: "Measure JSON payload size",
    description: "Returns the UTF-8 byte size of a JSON-serializable value.",
    schema: z.object({ value: z.unknown() }),
    typeStub: `declare function jsonByteSize(input: {
  value: unknown;
}): Promise<number>;`,
    execute: (input) => Promise.resolve(jsonByteSize(input.value)),
  }),
  defineCapability({
    name: "percentageReduction",
    title: "Compute payload reduction percentage",
    description:
      "Computes the percentage reduction from an original byte size to a compact byte size.",
    schema: z.object({
      originalBytes: z.number().nonnegative(),
      compactBytes: z.number().nonnegative(),
    }),
    typeStub: `declare function percentageReduction(input: {
  originalBytes: number;
  compactBytes: number;
}): Promise<number>;`,
    execute: (input) =>
      Promise.resolve(
        percentageReduction(input.originalBytes, input.compactBytes),
      ),
  }),
];

export function createSandboxBindings(
  options: { signal?: AbortSignal; telemetry?: TelemetryRecorder } = {},
): Record<string, ToolBinding> {
  const telemetry = options.telemetry ?? createTelemetryRecorder();

  return Object.fromEntries(
    sandboxCapabilities.map((capability) => [
      capability.name,
      {
        name: capability.name,
        description: capability.description,
        inputSchema: capability.inputSchema,
        execute: (input: unknown) =>
          capability.invoke(input, {
            telemetry,
            ...(options.signal ? { signal: options.signal } : {}),
          }),
      },
    ]),
  );
}

export function searchCapabilities(query: string): SandboxCapability[] {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return sandboxCapabilities;
  }

  const terms = normalized.split(/\s+/u);

  return sandboxCapabilities.filter((capability) => {
    const haystack = [capability.name, capability.title, capability.description]
      .join(" ")
      .toLowerCase();

    return terms.some((term) => haystack.includes(term));
  });
}

export function typeDefinitionsFor(names: string[]): string {
  const selected = sandboxCapabilities.filter((capability) =>
    names.includes(capability.name),
  );

  return [sharedTypeDefinitions, ...selected.map((capability) => capability.typeStub)]
    .join("\n\n")
    .trim();
}
