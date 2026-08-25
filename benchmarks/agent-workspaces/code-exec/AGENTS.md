# Code-Exec MCP Workspace

Use the `smart_orchestrator_code_exec` MCP server for dependency-upgrade analysis.

High-level workflow:

1. Discover the available typed analysis capabilities with `search_capabilities`.
2. Load the type definitions needed for GumTree diffing, usage search, and helpers with `get_type_definitions`.
3. Generate a single TypeScript orchestration program and run it with `execute_typescript`.
4. Keep intermediate GumTree and usage-search payloads inside the executed program.
5. Return only compact JSON with changed methods, affected call sites, warnings, and payload-size fields.

Execution guidance:

- Call `execute_typescript` with only `{ code }`. Timeouts, memory, and output limits are fixed in the server config (`src/config.ts`).
- The generated TypeScript should `return` the final object. Do not use `console.log`.
- The code runs in an isolated V8 sandbox (TanStack AI Code Mode). Capabilities are injected as global async functions: `gumtreeDiff`, `findJavaCallSites`, `oldSymbolsFrom`, `jsonByteSize`, and `percentageReduction`. Always `await` them.
- Each function takes a single object argument matching its type definition, for example `await oldSymbolsFrom({ changes: diff.changedSymbols })`.
- Host globals such as `process`, `require`, `fetch`, and `Buffer` do not exist in the sandbox. Use `await jsonByteSize({ value })` and `await percentageReduction({ originalBytes, compactBytes })` for payload-size fields.

Do not use shell commands or direct file reads for the benchmark task. Use MCP tools only.
The workspace uses a read-only shell sandbox, but the MCP-only rule is still verified from the final JSONL tool sequence rather than enforced as a complete no-shell-read policy.
