---
name: review-plan
description: Review OpenSpec planning artifacts by orchestrating proposal, design, specs, and task review gates. Use only when an OpenSpec workflow explicitly requests standalone planning artifact review.
---

# review-plan

Run the planning review workflow for a named OpenSpec change.

## Inputs

- Change name.
- Proposal, design, specs, and tasks.
- Existing specs and repository context only when needed to judge consistency.
- OpenSpec status/instruction output when available.

## Workflow

Invoke the `reviewer` agent as concurrent subagents for lower-level planning review. Each reviewer-agent task prompt must start exactly with the skill invocation shown here:

1. `/skill:review-proposal <change-name>`
2. `/skill:review-specs <change-name>`
3. `/skill:review-design <change-name>`
4. `/skill:review-tasks <change-name>`

Each subagent reviews one primary artifact file for both document structure and content appropriate to that document type. Pass only the context each reviewer needs: the relevant artifact, dependency artifacts, existing specs when needed, and any command output or repository context required to ground findings.

Collect findings after the concurrent review batch completes, deduplicate them, and report the highest-severity actionable set. Fix blockers by updating only the targeted planning artifact, or report them as required changes. If a finding points to an upstream artifact, route the finding to that artifact. Fix concerns or ask the user to explicitly accept them. Ask the user when a finding requires a product, scope, or design decision that is not already in the artifacts. Treat suggestions as optional.

Do not write application code. Do not run apply, archive, git commit, git push, PR creation, or finishing-branch behavior.

## Review focus

Check that planning artifacts are coherent as a set:

- proposal explains why and what without drifting into implementation detail;
- design explains implementation decisions, trade-offs, risks, and integration points;
- specs define behavior with testable scenarios and correct delta sections;
- tasks are ordered, small, verifiable, and mapped to proposal/spec/design;
- review findings across artifacts do not contradict each other;
- the change is ready for implementation only after blocker findings are resolved.

## Output

Return concise findings as prose/bullets. Use severity `blocker`, `concern`, or `suggestion`. Do not use tables or pipe-delimited rows.

```md
### <Severity>: <short finding title>

Target artifact: <artifact path>
Upstream artifact: <artifact path or none>
Requires user decision: <yes/no>
Location: <section, line, or path>
Evidence: <quoted or summarized evidence>
Problem: <what is wrong>
Impact: <why it matters>
Recommended fix: <smallest concrete fix>
```

If no issues are found, return `No issues found`.
