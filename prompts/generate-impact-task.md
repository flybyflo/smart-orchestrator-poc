# Example Task Prompt

This is the kind of prompt an orchestrating agent receives, and which the code-execution MCP server is designed to answer with a single generated program.

```text
Analyze the dependency upgrade impact for this Java fixture:

- old library file: fixtures/v1/library/Parser.java
- new library file: fixtures/v2/library/Parser.java
- application root: fixtures/app

Use the available MCP tools only. Do not run shell commands and do not read files directly outside MCP.

Return only compact JSON. The JSON should include the diff adapter, changed methods, affected application call sites, warnings, and any payload-size or reduction fields that the available MCP workflow can produce.
```

Expected agent workflow against the code-execution server:

1. `search_capabilities` — discover the five typed analysis functions.
2. `get_type_definitions` — load their TypeScript stubs.
3. `execute_typescript` — submit one program that chains `gumtreeDiff` → `oldSymbolsFrom` → `findJavaCallSites` and returns the compact report.

The type stubs are served from the single capability source of truth in `src/orchestrator/bindings.ts`. This exact prompt is used verbatim by the same-prompt Codex benchmark (`npm run benchmark:codex-exec:same-prompt`).
