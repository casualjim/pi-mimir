# Documentation map

Use this page to find the authoritative document for a task. Current shipped
behavior governs existing APIs. Historical plans and research are evidence,
not shipped contracts, when a later decision supersedes them.

## Shipped contracts

- [`../README.md`](../README.md) — installation, public tools, configuration,
  lifecycle, and role authoring.
- [`../CONTEXT.md`](../CONTEXT.md) — orchestration glossary.
- [`../skills/orchestrate/SKILL.md`](../skills/orchestrate/SKILL.md) — public
  subagent review fan-out and parent synthesis procedure.
- [`../skills/orchestrate/adversarial-review.md`](../skills/orchestrate/adversarial-review.md)
  — adversarial topology, finding records, and incomplete-coverage policy.
- [`worktree-subagents.md`](worktree-subagents.md) — worktree operation,
  review, recovery, and cleanup.

The package launches asynchronous Pi children in Herdr and supports managed
worktrees for writing tasks. Orchestrated review materializes pinned evidence,
launches fresh public reviewers, receives automatic completion delivery, and
has the parent synthesize outcomes. Role frontmatter tool allowlists are the
available enforcement boundary; `read,bash` is not read-only. Automated package
acceptance covers unit tests, lint, and `npm pack --dry-run`. Deterministic
Herdr integration is a manual release gate run from inside Herdr. The manual
supervision transport benchmark is `../test/bench/supervision-bench.mjs`; it
uses an isolated Herdr server and writes uncommitted raw samples to
`/tmp/issue29-bench/`.

## Historical material

- [`research/`](research/) — background evidence and alternatives, not shipped
  behavior.
