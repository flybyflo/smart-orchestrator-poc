import type { CodeChange, JavaSymbol } from "../types.js";

export function oldSymbolsFrom(changes: CodeChange[]): JavaSymbol[] {
  const bySignature = new Map<string, JavaSymbol>();

  for (const change of changes) {
    const symbol = change.oldSymbol ?? change.newSymbol;

    if (symbol) {
      bySignature.set(symbol.signature, symbol);
    }
  }

  return [...bySignature.values()];
}

export function percentageReduction(originalBytes: number, compactBytes: number): number {
  if (originalBytes <= 0) {
    return 0;
  }

  return Number((100 * (1 - compactBytes / originalBytes)).toFixed(2));
}
