import { readWorkspaceTextFile } from "./paths.js";
import type { JavaSymbol } from "../types.js";

export interface ParsedMethod {
  symbol: JavaSymbol;
  visibility: "public" | "protected" | "private" | "package";
  declaration: string;
  line: number;
}

export interface ParsedJavaFile {
  packageName: string;
  className: string;
  owner: string;
  methods: ParsedMethod[];
}

export async function parseJavaFile(
  filePath: string,
  options: {
    signal?: AbortSignal;
  } = {},
): Promise<ParsedJavaFile> {
  const source = await readWorkspaceTextFile(filePath, {
    extension: ".java",
    ...(options.signal ? { signal: options.signal } : {}),
  });
  return parseJavaSource(source);
}

export function parseJavaSource(source: string): ParsedJavaFile {
  const packageName = source.match(/\bpackage\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*;/)?.[1] ?? "";
  const className = source.match(/\bclass\s+([A-Za-z_$][\w$]*)\b/)?.[1] ?? "UnknownClass";
  const owner = packageName ? `${packageName}.${className}` : className;
  const methods: ParsedMethod[] = [];

  const methodPattern =
    /\b(public|protected|private)?\s*(?:static\s+)?(?:final\s+)?(?:synchronized\s+)?([A-Za-z_$][\w$<>\u005B\u005D.?,\s]*)\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*(?:throws\s+[^{]+)?\{/g;

  for (const match of source.matchAll(methodPattern)) {
    const [, visibilityRaw, returnTypeRaw, methodName, paramsRaw] = match;

    if (!returnTypeRaw || !methodName || paramsRaw === undefined) {
      continue;
    }

    const returnType = normalizeJavaType(returnTypeRaw);
    const parameterTypes = parseParameterTypes(paramsRaw);
    const visibility = visibilityRaw ?? "package";
    const signature = `<${owner}: ${returnType} ${methodName}(${parameterTypes.join(",")})>`;
    const line = source.slice(0, match.index).split(/\r?\n/).length;
    const declaration = match[0].replace(/\s*\{$/, "").trim();

    methods.push({
      symbol: {
        owner,
        name: methodName,
        parameterTypes,
        returnType,
        signature,
      },
      visibility: visibility as ParsedMethod["visibility"],
      declaration,
      line,
    });
  }

  return {
    packageName,
    className,
    owner,
    methods,
  };
}

function parseParameterTypes(params: string): string[] {
  if (!params.trim()) {
    return [];
  }

  return params
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const withoutAnnotations = part
        .replace(/@\w+(?:\([^)]*\))?\s*/g, "")
        .replace(/\bfinal\s+/g, "")
        .trim();
      const pieces = withoutAnnotations.split(/\s+/);
      return normalizeJavaType(pieces.slice(0, -1).join(" ") || (pieces[0] ?? "unknown"));
    });
}

function normalizeJavaType(typeName: string): string {
  const compact = typeName.replace(/\s+/g, " ").trim().replace(/\.\.\.$/, "[]");
  const withoutGenerics = compact.replace(/<.*>/, "");

  switch (withoutGenerics) {
    case "String":
      return "java.lang.String";
    case "Integer":
      return "java.lang.Integer";
    case "Boolean":
      return "java.lang.Boolean";
    case "Long":
      return "java.lang.Long";
    default:
      return withoutGenerics;
  }
}
