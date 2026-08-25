import type {
  CallSite,
  JavaSymbol,
  UsageSearchInput,
  UsageSearchResult,
} from "../types.js";
import { findFilesByExtension } from "./files.js";
import { tokenizeJava, type JavaToken } from "./java-lexical.js";
import { readWorkspaceTextFile, throwIfAborted } from "./paths.js";

export async function findJavaCallSites(
  input: UsageSearchInput,
  options: { signal?: AbortSignal } = {},
): Promise<UsageSearchResult> {
  const files = await findFilesByExtension(input.rootDirectory, ".java", {
    ...(options.signal ? { signal: options.signal } : {}),
  });
  const callSites: CallSite[] = [];

  for (const file of files) {
    throwIfAborted(options.signal);
    const source = await readWorkspaceTextFile(file, {
      extension: ".java",
      ...(options.signal ? { signal: options.signal } : {}),
    });
    const javaFile = analyzeJavaFile(source);

    for (const call of javaFile.calls) {
      for (const symbol of input.symbols) {
        const match = matchCallToSymbol(call, javaFile, symbol);

        if (!match) {
          continue;
        }

        callSites.push({
          file,
          line: call.line,
          content: call.content,
          matchedSymbol: symbol,
          receiver: call.receiver,
          receiverType: match.receiverType,
          argumentCount: call.argumentCount,
          confidence: "high",
          evidence: match.evidence,
        });
      }
    }
  }

  return {
    callSites,
    scannedFiles: files.length,
    searchedSymbols: input.symbols,
  };
}

interface MethodCallCandidate {
  receiver: string;
  methodName: string;
  argumentCount: number;
  line: number;
  content: string;
  tokenIndex: number;
  scopePath: number[];
}

interface VariableDeclaration {
  name: string;
  rawType: string;
  tokenIndex: number;
  scopePath: number[];
}

interface JavaFileAnalysis {
  packageName: string;
  imports: Map<string, string>;
  wildcardImports: Set<string>;
  variables: VariableDeclaration[];
  calls: MethodCallCandidate[];
}

interface TokenStructure {
  pairs: Map<number, number>;
  scopePaths: number[][];
  parameterScopes: Array<{
    start: number;
    end: number;
    scopePath: number[];
  }>;
}

const declarationTerminators = new Set(["=", ";", ",", ")", ":", "["]);
const nonTypeWords = new Set([
  "break",
  "case",
  "class",
  "continue",
  "default",
  "do",
  "else",
  "enum",
  "extends",
  "final",
  "finally",
  "for",
  "if",
  "implements",
  "import",
  "instanceof",
  "interface",
  "new",
  "package",
  "private",
  "protected",
  "public",
  "record",
  "return",
  "static",
  "super",
  "switch",
  "synchronized",
  "this",
  "throw",
  "throws",
  "transient",
  "try",
  "volatile",
  "while",
  "yield",
]);

function analyzeJavaFile(source: string): JavaFileAnalysis {
  const tokens = tokenizeJava(source);
  const structure = analyzeTokenStructure(tokens);
  const { packageName, imports, wildcardImports } = readPackageAndImports(tokens);
  const variables = findVariableDeclarations(tokens, structure);
  const calls = findMethodCalls(source, tokens, structure);

  return {
    packageName,
    imports,
    wildcardImports,
    variables,
    calls,
  };
}

function analyzeTokenStructure(tokens: JavaToken[]): TokenStructure {
  const pairs = matchingPairs(tokens);
  const scopePaths: number[][] = [];
  const braceStack: number[] = [];

  for (const [index, token] of tokens.entries()) {
    scopePaths[index] = [...braceStack];
    if (token.value === "{") {
      braceStack.push(index);
    } else if (token.value === "}") {
      braceStack.pop();
    }
  }

  const parameterScopes: TokenStructure["parameterScopes"] = [];

  for (const [open, close] of pairs) {
    if (tokens[open]?.value !== "(") {
      continue;
    }

    const body = bodyAfterParameterList(tokens, open, close);
    if (body === undefined) {
      continue;
    }

    parameterScopes.push({
      start: open + 1,
      end: close - 1,
      scopePath: [...(scopePaths[body] ?? []), body],
    });
  }

  return { pairs, scopePaths, parameterScopes };
}

function matchingPairs(tokens: JavaToken[]): Map<number, number> {
  const pairs = new Map<number, number>();
  const stacks = new Map<string, number[]>([
    ["(", []],
    ["[", []],
    ["{", []],
  ]);
  const openingFor = new Map([
    [")", "("],
    ["]", "["],
    ["}", "{"],
  ]);

  for (const [index, token] of tokens.entries()) {
    const stack = stacks.get(token.value);
    if (stack) {
      stack.push(index);
      continue;
    }

    const opening = openingFor.get(token.value);
    if (!opening) {
      continue;
    }

    const open = stacks.get(opening)?.pop();
    if (open !== undefined) {
      pairs.set(open, index);
      pairs.set(index, open);
    }
  }

  return pairs;
}

function bodyAfterParameterList(
  tokens: JavaToken[],
  open: number,
  close: number,
): number | undefined {
  const name = tokens[open - 1];
  const beforeName = tokens[open - 2];

  if (!name || name.kind !== "identifier") {
    return undefined;
  }

  const isControlScope = ["catch", "for"].includes(name.value);
  const isMethod =
    !nonTypeWords.has(name.value) && beforeName?.value !== "." &&
    beforeName?.value !== "new";

  if (!isControlScope && !isMethod) {
    return undefined;
  }

  for (let index = close + 1; index < tokens.length; index += 1) {
    const value = tokens[index]?.value;
    if (value === "{") {
      return index;
    }
    if (value === ";" || value === "=" || value === "->") {
      return undefined;
    }
    if (value === ")") {
      return undefined;
    }
  }

  return undefined;
}

function readPackageAndImports(tokens: JavaToken[]): {
  packageName: string;
  imports: Map<string, string>;
  wildcardImports: Set<string>;
} {
  let packageName = "";
  const imports = new Map<string, string>();
  const wildcardImports = new Set<string>();

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token?.value !== "package" && token?.value !== "import") {
      continue;
    }

    const isImport = token.value === "import";
    let cursor = index + 1;
    if (isImport && tokens[cursor]?.value === "static") {
      continue;
    }

    const parts: string[] = [];
    while (cursor < tokens.length && tokens[cursor]?.value !== ";") {
      const value = tokens[cursor]?.value;
      if (value && value !== ".") {
        parts.push(value);
      }
      cursor += 1;
    }

    if (!isImport) {
      packageName = parts.join(".");
    } else if (parts.at(-1) === "*") {
      wildcardImports.add(parts.slice(0, -1).join("."));
    } else {
      const imported = parts.join(".");
      imports.set(simpleName(imported), imported);
    }
    index = cursor;
  }

  return { packageName, imports, wildcardImports };
}

function findVariableDeclarations(
  tokens: JavaToken[],
  structure: TokenStructure,
): VariableDeclaration[] {
  const variables: VariableDeclaration[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const name = tokens[index];
    const next = tokens[index + 1];
    if (
      !name ||
      name.kind !== "identifier" ||
      nonTypeWords.has(name.value) ||
      !next ||
      !declarationTerminators.has(next.value)
    ) {
      continue;
    }

    let rawType = typeBeforeVariable(tokens, index);
    if (!rawType || nonTypeWords.has(rawType)) {
      continue;
    }

    if (rawType === "var") {
      rawType = inferVarType(tokens, index) ?? rawType;
    }

    const parameterScope = structure.parameterScopes.find(
      (scope) => index >= scope.start && index <= scope.end,
    );

    variables.push({
      name: name.value,
      rawType,
      tokenIndex: index,
      scopePath: parameterScope?.scopePath ?? structure.scopePaths[index] ?? [],
    });
  }

  return variables;
}

function typeBeforeVariable(tokens: JavaToken[], variableIndex: number): string | undefined {
  let end = variableIndex - 1;

  while (tokens[end]?.value === "]") {
    const open = findOpeningToken(tokens, end, "[", "]");
    if (open === undefined) {
      return undefined;
    }
    end = open - 1;
  }

  if (tokens[end]?.value === ">") {
    const open = findOpeningToken(tokens, end, "<", ">");
    if (open === undefined) {
      return undefined;
    }
    end = open - 1;
  }

  if (tokens[end]?.kind !== "identifier") {
    return undefined;
  }

  let start = end;
  while (
    tokens[start - 1]?.value === "." &&
    tokens[start - 2]?.kind === "identifier"
  ) {
    start -= 2;
  }

  return tokens
    .slice(start, end + 1)
    .map((token) => token.value)
    .join("");
}

function findOpeningToken(
  tokens: JavaToken[],
  closeIndex: number,
  openValue: string,
  closeValue: string,
): number | undefined {
  let depth = 0;
  for (let index = closeIndex; index >= 0; index -= 1) {
    const value = tokens[index]?.value;
    if (value === closeValue) {
      depth += 1;
    } else if (value === openValue) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return undefined;
}

function inferVarType(tokens: JavaToken[], variableIndex: number): string | undefined {
  if (tokens[variableIndex + 1]?.value !== "=") {
    return undefined;
  }

  const newIndex = variableIndex + 2;
  if (tokens[newIndex]?.value !== "new") {
    return undefined;
  }

  const typeStart = newIndex + 1;
  let typeEnd = typeStart;
  while (
    tokens[typeEnd + 1]?.value === "." &&
    tokens[typeEnd + 2]?.kind === "identifier"
  ) {
    typeEnd += 2;
  }

  if (tokens[typeStart]?.kind !== "identifier") {
    return undefined;
  }

  return tokens
    .slice(typeStart, typeEnd + 1)
    .map((token) => token.value)
    .join("");
}

function findMethodCalls(
  source: string,
  tokens: JavaToken[],
  structure: TokenStructure,
): MethodCallCandidate[] {
  const calls: MethodCallCandidate[] = [];

  for (let methodIndex = 0; methodIndex < tokens.length; methodIndex += 1) {
    const method = tokens[methodIndex];
    const open = tokens[methodIndex + 1];
    if (
      !method ||
      method.kind !== "identifier" ||
      open?.value !== "(" ||
      tokens[methodIndex - 1]?.value !== "."
    ) {
      continue;
    }

    const receiverEnd = methodIndex - 2;
    if (tokens[receiverEnd]?.kind !== "identifier") {
      continue;
    }

    let receiverStart = receiverEnd;
    while (
      tokens[receiverStart - 1]?.value === "." &&
      tokens[receiverStart - 2]?.kind === "identifier"
    ) {
      receiverStart -= 2;
    }

    const close = structure.pairs.get(methodIndex + 1);
    if (close === undefined) {
      continue;
    }

    const receiver = tokens
      .slice(receiverStart, receiverEnd + 1)
      .map((token) => token.value)
      .join("");
    const content = source
      .slice(tokens[receiverStart]?.start, tokens[close]?.end)
      .replace(/\s+/gu, " ")
      .trim();

    calls.push({
      receiver,
      methodName: method.value,
      argumentCount: countArguments(tokens, methodIndex + 1, close),
      line: method.line,
      content,
      tokenIndex: methodIndex,
      scopePath: structure.scopePaths[methodIndex] ?? [],
    });
  }

  return calls;
}

function countArguments(tokens: JavaToken[], open: number, close: number): number {
  if (close === open + 1) {
    return 0;
  }

  let parentheses = 0;
  let brackets = 0;
  let braces = 0;
  let commas = 0;

  for (let index = open + 1; index < close; index += 1) {
    switch (tokens[index]?.value) {
      case "(":
        parentheses += 1;
        break;
      case ")":
        parentheses = Math.max(0, parentheses - 1);
        break;
      case "[":
        brackets += 1;
        break;
      case "]":
        brackets = Math.max(0, brackets - 1);
        break;
      case "{":
        braces += 1;
        break;
      case "}":
        braces = Math.max(0, braces - 1);
        break;
      case ",":
        if (parentheses === 0 && brackets === 0 && braces === 0) {
          commas += 1;
        }
        break;
    }
  }

  return commas + 1;
}

function matchCallToSymbol(
  call: MethodCallCandidate,
  javaFile: JavaFileAnalysis,
  symbol: JavaSymbol,
): { receiverType: string; evidence: string } | undefined {
  if (
    call.methodName !== symbol.name ||
    call.argumentCount !== symbol.parameterTypes.length
  ) {
    return undefined;
  }

  const variableName = call.receiver.split(".").at(-1) ?? call.receiver;
  const variable = resolveVariable(variableName, call, javaFile.variables, {
    fieldsOnly: call.receiver.startsWith("this."),
  });

  if (variable) {
    const receiverType = resolveType(variable.rawType, javaFile, symbol.owner);
    if (receiverType === symbol.owner) {
      return {
        receiverType,
        evidence: `receiver ${call.receiver} resolves to ${receiverType} in lexical scope`,
      };
    }
    return undefined;
  }

  const staticReceiver = call.receiver.split(".").at(-1) ?? call.receiver;
  if (!/^[A-Z_$]/u.test(staticReceiver)) {
    return undefined;
  }

  const receiverType = resolveType(call.receiver, javaFile, symbol.owner);
  if (receiverType !== symbol.owner) {
    return undefined;
  }

  return {
    receiverType,
    evidence: `static receiver ${call.receiver} resolves to ${receiverType}`,
  };
}

function resolveVariable(
  name: string,
  call: MethodCallCandidate,
  variables: VariableDeclaration[],
  options: { fieldsOnly: boolean },
): VariableDeclaration | undefined {
  return variables
    .filter(
      (variable) =>
        variable.name === name &&
        variable.tokenIndex < call.tokenIndex &&
        isScopePrefix(variable.scopePath, call.scopePath) &&
        (!options.fieldsOnly || variable.scopePath.length < call.scopePath.length),
    )
    .sort(
      (left, right) =>
        right.scopePath.length - left.scopePath.length ||
        right.tokenIndex - left.tokenIndex,
    )[0];
}

function isScopePrefix(prefix: number[], value: number[]): boolean {
  return prefix.every((scope, index) => value[index] === scope);
}

function resolveType(
  rawType: string,
  javaFile: Pick<JavaFileAnalysis, "packageName" | "imports" | "wildcardImports">,
  targetOwner: string,
): string {
  const erased = rawType.replace(/\[\]$/gu, "").trim();

  if (erased.includes(".")) {
    return erased;
  }

  const imported = javaFile.imports.get(erased);
  if (imported) {
    return imported;
  }

  const javaLang = new Map([
    ["String", "java.lang.String"],
    ["Integer", "java.lang.Integer"],
    ["Boolean", "java.lang.Boolean"],
    ["Long", "java.lang.Long"],
  ]).get(erased);
  if (javaLang) {
    return javaLang;
  }

  const targetPackage = packageName(targetOwner);
  if (
    simpleName(targetOwner) === erased &&
    javaFile.wildcardImports.has(targetPackage)
  ) {
    return targetOwner;
  }

  return javaFile.packageName ? `${javaFile.packageName}.${erased}` : erased;
}

function packageName(typeName: string): string {
  return typeName.split(".").slice(0, -1).join(".");
}

function simpleName(name: string): string {
  return name.split(".").at(-1) ?? name;
}
