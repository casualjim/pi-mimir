---
name: review-plan
description: Review OpenSpec planning artifacts in one coherent pass. Use only when an OpenSpec workflow or user explicitly requests planning review for a named change.
---

# review-plan

Review proposal, specs, design, and tasks for a named OpenSpec change as one planning set.

## Inputs

- Change name.
- `openspec/changes/<change>/proposal.md`.
- All delta spec files under `openspec/changes/<change>/specs/`.
- `openspec/changes/<change>/design.md`.
- `openspec/changes/<change>/tasks.md`.
- Accepted specs under `openspec/specs/<capability>/spec.md` when checking modified or removed behavior.
- Existing specs and repository context only when needed to judge capability naming, consistency, or feasibility.
- OpenSpec status/instruction output when available.

## Scope

- Review only whether the planning artifacts are sufficient, coherent, and ready to drive implementation.
- Review proposal/specs/design/tasks together as one planning review.
- Do not review implementation, code, tests, CI, or archive readiness.
- Do not edit artifacts while reviewing; return findings for a separate revision step.
- Return the whole issue list inline by default. Only write a review file if the caller explicitly asks.
- The review is single-shot: inspect every in-scope artifact and section now, surface all actionable issues observable from the current evidence, and do not intentionally save findings for later rounds.
- After the reported findings are addressed, a follow-up review over unchanged planning material should ideally report only net new issues introduced by the edits or made newly reviewable by newly supplied evidence.
- If you report a later-round issue from previously reviewed planning material, explicitly state why it was not reliably reviewable earlier.
- Apply a materiality filter: suppress wording-only, tone-only, prose-polish, or editorial findings when they do not materially change scope, behavior, risk, implementation readiness, or the concrete interpretation of the change.

## Workflow

1. Read proposal, specs, design, and tasks together as one planning set.
2. Route every finding to one target artifact. If the root cause belongs upstream, name that upstream artifact explicitly.
3. Prefer one integrated review over mechanical fan-out.
4. Collect all findings across all planning artifacts, deduplicate them, and report the complete actionable issue list in one pass.
5. Apply a materiality filter before reporting: if fixing the issue would not meaningfully change implementation behavior, scope understanding, risk, design direction, tasking, or readiness, do not report it.
6. Do not stop after the highest-severity class, the first few issues, or a representative sample; include every CRITICAL, WARNING, and SUGGESTION that survives the materiality filter.
7. Do not intentionally save issues in unchanged sections for later rounds; if the evidence exists in this review pass and the issue is material, report it now.
8. If a finding points to an upstream artifact, route the finding to that artifact.
9. Mark findings that require a product, scope, or design decision not already in the artifacts as requiring a user decision.
10. Treat suggestions as optional.

Do not write application code. Do not run apply, archive, git commit, git push, PR creation, or finishing-branch behavior.

## Review focus

### Proposal checks

Check that the proposal:

- only describes the change;
- explains WHY and high-level WHAT without drifting into HOW;
- states the problem, opportunity, motivation, expected benefit, scope boundaries, and impact clearly;
- names new and modified capabilities consistently with expected spec paths;
- identifies affected users, systems, APIs, dependencies, compatibility, risks, constraints, caveats, and open questions when relevant;
- avoids extra narrative such as research chronology, rejected investigation paths, roadmap, retrospective, or implementation-planning content.

### Specs checks

Check that specs:

- match the proposal's declared capabilities;
- use valid delta sections: ADDED, MODIFIED, REMOVED, RENAMED;
- use normative SHALL/MUST language;
- define behavior, not implementation mechanics;
- include at least one `#### Scenario:` per requirement;
- use concrete, testable WHEN/THEN scenarios with important success, failure, edge, compatibility, permission, migration, and boundary cases where relevant;
- preserve full existing requirement blocks for MODIFIED requirements;
- include reason and migration for REMOVED requirements;
- avoid contradictions, duplicate requirements, orphan spec files, and ambiguous requirements.

### Design checks

Check that the design:

- explains HOW the change will be implemented;
- traces to proposal goals and spec requirements;
- contains concrete decisions, rationale, trade-offs, risks, alternatives, and integration points;
- addresses migration, rollout, rollback, failure modes, and operational concerns where relevant;
- is technically feasible and keeps scope explicit;
- avoids drifting into task checklist detail.

### Tasks checks

Check that tasks:

- use parseable checkbox format `- [ ] X.Y Task description`;
- are ordered by dependency and implementation flow;
- are small, concrete, and independently verifiable;
- map back to proposal, specs, and design;
- cover required implementation, test, documentation, configuration, migration, rollout, or cleanup work where relevant;
- avoid hidden commit, push, PR, archive, or finishing-branch work;
- do not smuggle unresolved design decisions into implementation.

### Cross-artifact coherence checks

Check that the planning artifacts as a set:

- stay consistent with each other;
- do not contradict on scope, capabilities, behavior, decisions, or sequencing;
- contain no orphan design elements or tasks unrelated to proposal/specs;
- focus on substantive implementation readiness rather than editorial polish;
- are ready to drive implementation only after CRITICAL findings are resolved and WARNING findings are fixed or explicitly accepted.

## Output

Generate a complete planning review report: summary scorecard, issues grouped by priority, and final assessment. 
Report the whole issue list; do not limit output to the highest-severity actionable set.

Use these priorities:

- `CRITICAL` (must fix before implementation): planning cannot safely drive implementation, contradicts OpenSpec semantics, or leaves required behavior/design/tasking undefined.
- `WARNING` (should fix or explicitly accept): planning can continue only if the user accepts the ambiguity, trade-off, or debt.
- `SUGGESTION` (nice to fix): optional improvement only when it materially improves understanding, reviewability, or implementation readiness.

Do not emit findings for wording-only, tone-only, or editorial refinements that leave the substantive outcome unchanged.

Use clear markdown with this structure:

```md
## Planning Review Report: <change-name>

### Summary
| Dimension | Status |
|-----------|--------|
| Proposal | Pass/Issues |
| Specs | Pass/Issues |
| Design | Pass/Issues |
| Tasks | Pass/Issues |
| Cross-artifact coherence | Pass/Issues |

### Issues by Priority

#### CRITICAL (Must fix before implementation)
- **<short finding title>**
  - Target artifact: <artifact path>
  - Upstream artifact: <artifact path or none>
  - Requires user decision: <yes/no>
  - Location: <section, line, or path>
  - Evidence: <quoted or summarized evidence>
  - Problem: <what is wrong>
  - Impact: <why it matters>
  - Recommendation: <smallest concrete fix>

#### WARNING (Should fix or explicitly accept)
- **<short finding title>**
  - Target artifact: <artifact path>
  - Upstream artifact: <artifact path or none>
  - Requires user decision: <yes/no>
  - Location: <section, line, or path>
  - Evidence: <quoted or summarized evidence>
  - Problem: <what is wrong>
  - Impact: <why it matters>
  - Recommendation: <smallest concrete fix>

#### SUGGESTION (Nice to fix)
- **<short finding title>**
  - Target artifact: <artifact path>
  - Upstream artifact: <artifact path or none>
  - Requires user decision: <yes/no>
  - Location: <section, line, or path>
  - Evidence: <quoted or summarized evidence>
  - Problem: <what is wrong>
  - Impact: <why it matters>
  - Recommendation: <smallest concrete fix>

### Final Assessment
- If CRITICAL issues exist: "X critical issue(s) found. Fix before implementation."
- If only WARNING issues exist: "No critical issues. Y warning(s) require fixes or explicit acceptance before implementation."
- If only SUGGESTION issues exist: "No critical or warning issues. Z suggestion(s) to consider. Ready for implementation."
- If no issues exist: "No issues found. Ready for implementation."
```

If a priority section has no issues, write `None` under that heading. When asked to write a review artifact, use the same report structure. Every issue must include evidence, whether a user decision is required, and a specific actionable recommendation; avoid vague recommendations such as "consider reviewing".
