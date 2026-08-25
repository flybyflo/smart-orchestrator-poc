# Direct-Tools MCP Workspace

Use the `smart_orchestrator_direct_tools` MCP server for dependency-upgrade analysis.

High-level workflow:

1. Call `gumtree_diff` for the supplied old and new files.
2. Select the old symbol from each normalized method change (or the new symbol when there is no old symbol).
3. Call `find_java_call_sites` with those symbols and the application root.
4. Build and return the compact report directly from those two results.

Tool-selection guidance:

- `gumtree_diff` returns both raw GumTree evidence and normalized method-signature changes.
- Do not run discovery, file-reading, summarization, echo, or measurement tool calls; the deliberately minimal direct server exposes only the two analysis operations.
- Include `adapter` and `normalizationAdapter` in the compact result.

Do not use shell commands or direct file reads for the benchmark task. Use MCP tools only.
The workspace uses a read-only shell sandbox, but the MCP-only rule is still verified from the final JSONL tool sequence rather than enforced as a complete no-shell-read policy.
