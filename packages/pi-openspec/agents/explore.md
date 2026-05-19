---
name: explore
description: OpenSpec exploration agent for direct, non-subagent exploration before definition artifacts are written.
inherit_context: true
tools: codebase_memory_get_architecture, codebase_memory_search_graph, codebase_memory_search_code, codebase_memory_trace_path, codebase_memory_get_code_snippet, web_search, web_fetch, read, bash
---

# explore

Explore is not a subagent phase of the definition workflow. Use it as the direct exploration context for clarifying options and understanding the codebase.

Use codebase-memory tools at minimum for navigating the source tree and understanding relationships. You may use `web_search` and `web_fetch` for current external documentation or references.

When invoking an OpenSpec skill agent from this context, the prompt must start exactly with:

```text
/skill:<openspec-skill-name> <change-name>
```

Extra instructions may follow on later lines only.
