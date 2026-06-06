---
name: review-implementation
description: Review delivered code, CI, config, and generated assets. Use when explicit implementation review is requested; OpenSpec artifacts are optional context.
disable-model-invocation: true
---

# review-implementation

Review implementation work for a supplied review scope. This is a whole-tree implementation review, not an active-changeset review. Inspect surrounding code, tests, config, package surfaces, conventions, and integration points whenever needed. If the scope names an OpenSpec change or includes OpenSpec artifacts, use those artifacts as review context; otherwise review the supplied request, acceptance criteria, evidence, and repository context. Diff or changed files are discovery seeds only, never review boundaries.

## Inputs

- Review scope or change name.
- Optional OpenSpec proposal, specs, design, and tasks when available.
- User request, acceptance notes/criteria, implementation evidence, CI/test output, generated assets, config, relevant logs, and optional diff/changed files as discovery seeds only.

## Workflow

Define `<review-scope>` as the supplied OpenSpec change name when present; otherwise use the user-provided acceptance scope or implementation goal. Never define `<review-scope>` as "active changeset" or limit it to branch/diff summary; diffs identify entrypoints, not boundaries.

Invoke the `implementation-reviewer` agent as concurrent subagents for lower-level implementation review. Never set a subagent timeout for these review invocations. If a caller or harness requires a timeout field, express it in hours (`1 hour`, `2 hours`), never seconds or minutes. Each implementation-reviewer task prompt must start exactly with the skill invocation shown here:

1. `/skill:review-architecture <review-scope>`
2. `/skill:review-tests <review-scope>`
3. `/skill:review-data-flow <review-scope>`
4. `/skill:review-security <review-scope>`

Pass the review scope, optional OpenSpec proposal/specs/design/tasks when available, relevant implementation evidence, CI/test output, logs, user request or acceptance criteria, and enough repository context to ground findings. Tell every reviewer: do not invent new requirements or generic best-practice improvements; judge correctness, repo rules, and SPEC.md/artifact adherence only. Do not require `openspec/changes/...` to exist for non-OpenSpec review scopes. Do not restrict findings to changed files or changed lines. Do not apply active-changeset or diff-overlap limits. Unchanged-code issues are reviewable when accepting the implementation would depend on, cement, expose, or worsen them.

Treat the review as single-shot: inspect the full acceptance scope now, including unchanged surrounding code when relevant. Surface all actionable issues observable from the current evidence, and do not intentionally save findings for later rounds.
Collect findings, deduplicate them, and report the complete actionable issue list in one pass. Do not stop after the highest-severity class, the first few issues, or a representative sample. Avoid issue proliferation by grouping findings with the same root cause and suppressing broad doctrine findings without concrete evidence, consequence, and smallest repair.
After the reported findings are addressed, a follow-up review over unchanged implementation material should ideally report only net new issues introduced by the changes or made newly reviewable by newly supplied evidence.
If a later-round issue comes from previously reviewed material, explicitly state why it was not reliably reviewable earlier.

## Review focus

Check that the implementation:

- satisfies the user request and supplied artifacts; if OpenSpec artifacts are present, satisfies proposal, specs, design, and completed tasks;
- has meaningful tests or CI evidence for required behavior and regressions;
- updates config/package/generated assets correctly and consistently;
- respects ownership boundaries and integration points;
- avoids security, trust-boundary, shell/path injection, and secret-handling risks;
- avoids relevant performance/resource regressions;
- does not include commit, push, PR, archive, or finishing-branch behavior.

## Output

Generate a complete implementation review in caveman/cavecrew-reviewer-style terse format. Report the whole actionable issue list; do not limit output to the highest-severity actionable set. Convert specialist findings into one-line findings and preserve enough evidence in each line to justify the issue.

Use these tiers:

| Emoji | Tier | Use for |
|---|---|---|
| 🔴 | blocker | Must fix before acceptance: violated requirement, serious correctness/security/performance risk, architecture boundary break, or missing required evidence |
| 🟡 | concern | Should fix or explicitly accept: real ambiguity, debt, edge risk, weak evidence, or drift that acceptance would cement |
| 🔵 | suggestion | Optional local clarity/resilience/maintainability improvement |
| ❓ | decision | User/product/architecture decision needed before judging |
| ✅ | keep | Accepted exception / keep-as-is tradeoff |

Output findings only. No praise, no preamble, no scorecard, no prose sections, no markdown bullets. One line per issue:

```text
path/to/file.ts:42: 🔴 blocker: auth bypasses owner check. Check resolved object owner before write.
path/to/file.ts:118: 🟡 concern: test only asserts command exists. Add behavior assertion for failure path.
path/to/file.ts:7: ❓ decision: config fallback changes required state. Confirm if silent default accepted.
path/to/file.ts:21: ✅ keep: direct call is acceptable. Scope local; revisit if second implementation appears.
totals: 1🔴 1🟡 0🔵 1❓ 1✅
```

Rules:

- File order, ascending line numbers within file.
- Include exact path and line when available.
- If exact line is unavailable, use closest path plus `?:`, symbol, or section: `path/to/file.ts:?: 🟡 concern: ...`.
- Each line must contain problem and smallest fix/decision in one sentence or two short fragments.
- Group same-root-cause issues into one line when possible.
- Accepted exceptions use ✅ lines so they remain visible without becoming blockers.
- Zero findings → `No issues.`
