# @casualjim/pi-review

Standalone review package for Pi.

## Commands

- `/review` — review staged, unstaged, and untracked changes via `cavecrew-reviewer` with Codex-style bug rules.
- `/review --base <branch>` — review diff from merge-base with `<branch>`.
- `/review --commit <sha>` — review one commit.
- `/review --custom <instructions>` — review arbitrary scope/instructions.

`/review` sends a read-only delegation prompt: load `cavecrew`, list subagents, run executable `cavecrew-reviewer`, apply Codex `codex-rs/core/review_prompt.md` bug-selection rules without the Codex JSON output schema, map P0/P1→🔴, P2→🟡, P3→🔵, then return readable cavecrew-reviewer findings. Findings must overlap the reviewed diff.

## Skills

Packaged from `skills/`:

- `review-implementation` — whole-tree implementation review with architecture, tests, data-flow, and security subreviews.
- `review-architecture` — architecture adherence, ownership, dependency direction, boundaries, and evolution safety.
- `review-tests` — meaningful test evidence, requirement coverage, adversarial cases, and weak assertions.
- `review-data-flow` — materialization, allocation, batching, pagination, streaming, and backpressure risks.
- `review-security` — assets, actors, hostile input, trust boundaries, enforcement points, and exploit paths.

`review-implementation` uses the bundled `implementation-reviewer` agent for specialist fan-out. The package syncs that agent into the Pi user agent directory on session start, preserving user-modified files.

## Review behavior

Reviewers must:

- use codebase-memory first for code exploration when available;
- state degraded discovery when codebase-memory is unavailable/stale;
- inspect exact files, tests, config, logs, and surrounding repository context before findings;
- report the whole actionable issue list as caveman one-line severity-tagged findings;
- group findings that share a root cause;
- record accepted exceptions / keep-as-is tradeoffs explicitly;
- not edit files, mutate git state, push, open PRs, deploy, archive, or leave GitHub comments.

`/review` is diff-oriented. `review-implementation` is whole-tree and may flag surrounding-code issues when accepting the implementation would depend on, cement, expose, or worsen them.

This package is standalone and does not depend on `@casualjim/pi-openspec`. OpenSpec artifacts may be supplied as optional review context.
