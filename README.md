# Smart Orchestrator PoC

**Code-executed tool orchestration for Java dependency-upgrade analysis.**

## Direct calls vs code execution

### Direct MCP

```mermaid
flowchart LR
    LLM[LLM]
    subgraph MCP[Direct MCP server]
        DIFF[gumtree_diff]
        SITES[find_java_call_sites]
    end
    REPORT[Report]

    LLM -->|1. call| DIFF
    DIFF -.->|diff and method changes| LLM
    LLM -->|2. call| SITES
    SITES -.->|affected call sites| LLM
    LLM --> REPORT
```

### Code-execution MCP

```mermaid
flowchart LR
    LLM[LLM]
    subgraph MCP[Code-execution MCP server]
        SEARCH[search_capabilities]
        TYPES[get_type_definitions]
        EXEC[execute_typescript]
    end
    SANDBOX[Sandbox - not MCP tools<br/>gumtreeDiff<br/>oldSymbolsFrom<br/>findJavaCallSites<br/>jsonByteSize<br/>percentageReduction]

    LLM -->|1. discover| SEARCH
    LLM -->|2. load types| TYPES
    LLM -->|3. run TypeScript| EXEC
    EXEC --> SANDBOX
    SANDBOX -->|compact report| EXEC
    EXEC -.-> LLM
```

## Results
Two approaches: Direct mcp vs code execution mcp:

- **Direct tools:** the raw diff and call-site results pass through the LLM.
- **Code execution:** intermediate results stay in the sandbox; only the report returns to the LLM.

| Approach | Data transferred | Tool calls |
|---|---:|---:|
| Direct tools | 11,103 B | 2 |
| Code execution | 7,118 B | 3 |

Code execution transfers **35.89% less data** and uses one extra cold-start call in this very simple benchmark.
