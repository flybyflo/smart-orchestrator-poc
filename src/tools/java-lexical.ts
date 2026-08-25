export type JavaTokenKind = "identifier" | "literal" | "number" | "symbol";

export interface JavaToken {
  kind: JavaTokenKind;
  value: string;
  start: number;
  end: number;
  line: number;
}

/**
 * A deliberately small Java lexer for source-level usage analysis. Comments are
 * discarded and quoted values become one token, so punctuation inside either
 * cannot be mistaken for calls or argument separators.
 */
export function tokenizeJava(source: string): JavaToken[] {
  const tokens: JavaToken[] = [];
  let index = 0;
  let line = 1;

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (!char) {
      break;
    }

    if (/\s/u.test(char)) {
      if (char === "\n") {
        line += 1;
      }
      index += 1;
      continue;
    }

    if (char === "/" && next === "/") {
      index += 2;
      while (index < source.length && source[index] !== "\n") {
        index += 1;
      }
      continue;
    }

    if (char === "/" && next === "*") {
      index += 2;
      while (index < source.length) {
        if (source[index] === "\n") {
          line += 1;
        }
        if (source[index] === "*" && source[index + 1] === "/") {
          index += 2;
          break;
        }
        index += 1;
      }
      continue;
    }

    if (source.startsWith('"""', index)) {
      const start = index;
      const startLine = line;
      index += 3;
      while (index < source.length && !source.startsWith('"""', index)) {
        if (source[index] === "\n") {
          line += 1;
        }
        index += 1;
      }
      index = Math.min(source.length, index + 3);
      tokens.push({
        kind: "literal",
        value: "<text-block>",
        start,
        end: index,
        line: startLine,
      });
      continue;
    }

    if (char === '"' || char === "'") {
      const start = index;
      const startLine = line;
      const quote = char;
      index += 1;
      while (index < source.length) {
        const current = source[index];
        if (current === "\\") {
          index += 2;
          continue;
        }
        if (current === "\n") {
          line += 1;
        }
        index += 1;
        if (current === quote) {
          break;
        }
      }
      tokens.push({
        kind: "literal",
        value: quote === '"' ? "<string>" : "<char>",
        start,
        end: index,
        line: startLine,
      });
      continue;
    }

    if (isIdentifierStart(char)) {
      const start = index;
      index += 1;
      while (index < source.length && isIdentifierPart(source[index] ?? "")) {
        index += 1;
      }
      tokens.push({
        kind: "identifier",
        value: source.slice(start, index),
        start,
        end: index,
        line,
      });
      continue;
    }

    if (/\d/u.test(char)) {
      const start = index;
      index += 1;
      while (index < source.length && /[\w.]/u.test(source[index] ?? "")) {
        index += 1;
      }
      tokens.push({
        kind: "number",
        value: source.slice(start, index),
        start,
        end: index,
        line,
      });
      continue;
    }

    tokens.push({
      kind: "symbol",
      value: char,
      start: index,
      end: index + 1,
      line,
    });
    index += 1;
  }

  return tokens;
}

function isIdentifierStart(char: string): boolean {
  return /[A-Za-z_$]/u.test(char);
}

function isIdentifierPart(char: string): boolean {
  return /[A-Za-z0-9_$]/u.test(char);
}
