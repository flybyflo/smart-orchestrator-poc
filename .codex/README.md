# Codex Workspace

This folder makes `smart-orchestrator-poc` usable as a Codex workspace with two MCP servers:

- `smart_orchestrator_code_exec`: Code Mode server with `search_capabilities`, `get_type_definitions`, and `execute_typescript`.
- `smart_orchestrator_direct_tools`: many-small-tools baseline server for direct MCP tool calling.

Open Codex from the repository root so the project-local `.codex/config.toml` is picked up. The config uses absolute paths — adjust them when cloning to a different location.

Run the reproducible local benchmark without Codex:

```bash
npm run benchmark:mcp
```

Run the larger fixture benchmark:

```bash
npm run benchmark:large
```

Run the generated-code repair loop:

```bash
npm run orchestrate
```

Run the Codex-backed token benchmark:

```bash
npm run benchmark:codex-exec
```

The Codex benchmark writes `outputs/codex-exec-usage-summary.md` and reads token counts from `codex exec --json` `turn.completed.usage` events.

Run the same-prompt Codex-backed token benchmark (the primary evaluation):

```bash
npm run benchmark:codex-exec:same-prompt
```

That benchmark uses the dedicated workspaces in `benchmarks/agent-workspaces/` and writes `outputs/codex-exec-same-prompt-summary.md`.
