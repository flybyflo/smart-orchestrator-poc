# Benchmark Results

Generated from the cleaned local benchmark on 2026-08-22.

Reproduce the deterministic results with:

```bash
npm run benchmark
```

## Minimal direct tools versus code execution

Both workflows perform the same analysis and must return byte-for-byte equivalent final reports. The direct server exposes only the two necessary analysis tools. The code-execution workflow includes capability discovery, type loading, and one execution call. Volatile `durationMs` values are normalized to zero for byte measurement so repeated runs do not change totals merely because a timing has a different number of digits; real timings remain in the artifacts.

| Approach | Listed tools | MCP calls | Schema bytes | Input bytes | Output bytes | Total bytes | Final report |
|---|---:|---:|---:|---:|---:|---:|---:|
| Code execution | 3 | 3 | 1,558 | 1,696 | 3,864 | 7,118 | 1,430 B |
| Minimal direct tools | 2 | 2 | 1,308 | 744 | 9,051 | 11,103 | 1,430 B |

Result:

- Final reports match exactly.
- Code execution transfers 3,985 fewer bytes, a 35.89% reduction.
- Code execution uses one additional cold-start call because discovery and type loading are counted.
- The saving comes from keeping the raw structural diff and usage intermediates inside the execution workflow, not from inflating the direct server's tool inventory.

Raw artifacts are written to `outputs/benchmark-mcp-comparison.json` and `outputs/benchmark-mcp-comparison.md`.

## Large fixture correctness

Fixture: `order-platform-large`

| Library pairs | Changed methods | Affected call sites | Raw bytes | Compact bytes | Reduction |
|---:|---:|---:|---:|---:|---:|
| 3 | 15/15 exact | 9/9 exact | 42,923 | 7,759 | 81.92% |

Correctness is based on exact sets stored in the fixture manifest—not counts alone. Changed methods and call sites both score precision/recall/F1 = 1.0.

## Adversarial Java fixture

The independent `adversarial-java` fixture covers multiline and nested calls, quoted punctuation, text blocks, comments containing fake calls, static receivers, wildcard imports, inferred `var` receivers, lexical shadowing, and same simple class names in different packages.

| Library pairs | Changed methods | Affected call sites | Raw bytes | Compact bytes | Reduction |
|---:|---:|---:|---:|---:|---:|
| 1 | 4/4 exact | 6/6 exact | 12,559 | 3,484 | 72.26% |

Both changed methods and affected call sites score precision/recall/F1 = 1.0. The regression suite contains 15 focused tests in addition to the sandbox, repair-loop, and MCP integration checks.

## Historical real-LLM result

The repository previously recorded a same-prompt Codex comparison showing 55.5% token savings. That run used the old 13-tool direct server, so it is not directly comparable to the current minimal two-tool baseline and is not used as a current headline result.

The optional `npm run benchmark:codex-exec:same-prompt` command remains available for a fresh real-LLM comparison. It is intentionally excluded from deterministic local verification because it requires external model execution and should be repeated across multiple runs before drawing statistical conclusions.
