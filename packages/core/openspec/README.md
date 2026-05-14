# OpenSpec assets

This package ships a `review-gated` OpenSpec schema/profile asset set.

The assets encode the package workflow contract:

- use codebase-memory-first discovery before ordinary subagent discovery;
- report degraded discovery and fall back to exact file reads or shell inspection when codebase-memory is unavailable;
- run proposal, specs, design, and tasks review gates before implementation;
- run claim, architecture, tests, performance, and security review gates after implementation verification;
- stop implementation before explicit generated OpenSpec archive and never include git commit as a workflow step;
- reuse OpenSpec-generated sync/archive behavior instead of adding an archive wrapper skill;
- update or recommend codebase-memory ADR after landed changes with durable architecture impact.

## Architecture memory ownership

OpenSpec artifacts in `openspec/changes/**` are canonical for change-scoped proposal, requirements, design, and tasks. Keeping them in canonical paths also keeps them indexable by codebase-memory.

codebase-memory ADR owns durable project-level architecture summaries and conventions. ADR entries should summarize landed decisions and link to the relevant OpenSpec artifacts instead of copying change-scoped content.

Path-scoped guidance remains optional. Use it only when subtree-local conventions are not captured well by codebase-memory ADR.
