---
description: Archive and trim long Cavekit SPEC.md with full-copy safety
argument-hint: "(no args needed)"
---
Use the `cavekit-archive` skill workflow for this request.

Arguments: $ARGUMENTS

Read project-root `SPEC.md`, produce a dry-run archive preview, and write only after explicit user approval. Copy exact full `SPEC.md` to `.cavekit/archive/` before trimming. Do not commit unless explicitly requested.
