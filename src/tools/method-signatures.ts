import type { CodeChange, GumTreeDiffInput } from "../types.js";
import { parseJavaFile, type ParsedMethod } from "./javaSymbols.js";

/**
 * Compares parsed Java API signatures. GumTree supplies the separate structural
 * diff; this function deliberately does not pretend to derive symbols from its
 * action JSON.
 */
export async function compareJavaMethodSignatures(
  input: GumTreeDiffInput,
  options: { signal?: AbortSignal } = {},
): Promise<CodeChange[]> {
  const signalOptions = options.signal ? { signal: options.signal } : {};
  const oldParsed = await parseJavaFile(input.oldFile, signalOptions);
  const newParsed = await parseJavaFile(input.newFile, signalOptions);
  const consumedNewMethodIndexes = new Set<number>();
  const changes: CodeChange[] = [];

  for (const oldMethod of oldParsed.methods) {
    const exactMatchIndex = newParsed.methods.findIndex(
      (candidate, index) =>
        !consumedNewMethodIndexes.has(index) &&
        candidate.symbol.signature === oldMethod.symbol.signature,
    );

    if (exactMatchIndex >= 0) {
      consumedNewMethodIndexes.add(exactMatchIndex);
      continue;
    }

    const sameNameIndex = closestSameNameMethod(
      oldMethod,
      newParsed.methods,
      consumedNewMethodIndexes,
    );

    if (sameNameIndex !== undefined) {
      const newMethod = newParsed.methods[sameNameIndex];

      if (!newMethod) {
        throw new Error(`Internal method index error for ${oldMethod.symbol.name}`);
      }

      consumedNewMethodIndexes.add(sameNameIndex);
      changes.push({
        changeType: "method_signature_changed",
        element: "method",
        oldSymbol: oldMethod.symbol,
        newSymbol: newMethod.symbol,
        oldDeclaration: oldMethod.declaration,
        newDeclaration: newMethod.declaration,
        oldLocation: { file: input.oldFile, line: oldMethod.line },
        newLocation: { file: input.newFile, line: newMethod.line },
        summary: `${oldMethod.symbol.name} changed signature from ${shortSignature(oldMethod)} to ${shortSignature(newMethod)}`,
      });
      continue;
    }

    changes.push({
      changeType: "method_removed",
      element: "method",
      oldSymbol: oldMethod.symbol,
      oldDeclaration: oldMethod.declaration,
      oldLocation: { file: input.oldFile, line: oldMethod.line },
      summary: `${oldMethod.symbol.name} was removed from ${oldMethod.symbol.owner}`,
    });
  }

  newParsed.methods.forEach((newMethod, index) => {
    if (!consumedNewMethodIndexes.has(index)) {
      changes.push({
        changeType: "method_added",
        element: "method",
        newSymbol: newMethod.symbol,
        newDeclaration: newMethod.declaration,
        newLocation: { file: input.newFile, line: newMethod.line },
        summary: `${newMethod.symbol.name} was added to ${newMethod.symbol.owner}`,
      });
    }
  });

  return changes;
}

function closestSameNameMethod(
  oldMethod: ParsedMethod,
  candidates: ParsedMethod[],
  consumed: Set<number>,
): number | undefined {
  return candidates
    .map((candidate, index) => ({ candidate, index }))
    .filter(
      ({ candidate, index }) =>
        !consumed.has(index) && candidate.symbol.name === oldMethod.symbol.name,
    )
    .sort(
      (left, right) =>
        signatureDistance(oldMethod, left.candidate) -
          signatureDistance(oldMethod, right.candidate) ||
        left.index - right.index,
    )[0]?.index;
}

function signatureDistance(left: ParsedMethod, right: ParsedMethod): number {
  const leftParameters = left.symbol.parameterTypes;
  const rightParameters = right.symbol.parameterTypes;
  const sharedLength = Math.min(leftParameters.length, rightParameters.length);
  let distance = Math.abs(leftParameters.length - rightParameters.length) * 2;

  for (let index = 0; index < sharedLength; index += 1) {
    if (leftParameters[index] !== rightParameters[index]) {
      distance += 1;
    }
  }

  if (left.symbol.returnType !== right.symbol.returnType) {
    distance += 1;
  }

  return distance;
}

function shortSignature(method: ParsedMethod): string {
  return `${method.symbol.name}(${method.symbol.parameterTypes.join(", ")})`;
}
