---
name: review-tests
description: Reviews implementation test quality by judging whether tests prove required behavior, invariants, failure modes, and realistic regressions across the relevant codebase. Use when asked for test review of meaningful coverage, public APIs, CLIs, generated outputs, validators, parsers, persistence, mocks, snapshots, property tests, fuzzing, or regression gaps.
---

# review-tests

Tests are evidence: judge what failures they rule out and what realistic bugs could still survive.

Do not praise test count, coverage percentage, or framework choice. Those are signals, not proof. A small test suite with strong behavioral evidence can be better than a large suite of tautologies.

Do not rewrite tests or implement fixes. Return concise findings grounded in the tests, production code, behavior contract, or command output you inspected.

## Inputs

Use the review request, production code under review, related codebase paths, tests, fixtures, snapshots, generated outputs, CI output, logs, requirements, specs, docs, API contracts, and repository testing conventions supplied by the caller.

When reviewing a spec-driven implementation, use:

- `openspec/changes/<change>/specs/**/*.md`
- `openspec/changes/<change>/proposal.md`, if needed for scope context
- `openspec/changes/<change>/tasks.md`, if needed for implementation scope context
- implementation test files relevant to the change
- implementation code only as needed to understand whether tests exercise real behavior

Inspect production code when needed to understand what the tests are supposed to prove. Inspect tests when needed to understand whether implementation claims are actually protected.

## Scope

- Review only whether every relevant requirement has meaningful implemented test coverage.
- If implementation test files are not present yet, return a blocker stating that test coverage cannot be reviewed before tests exist.
- Do not perform a general code review, task review, CI review, archive review, or implementation architecture review.
- Do not accept tests as sufficient merely because test files, test names, snapshots, mocks, or assertions exist.

## Source-of-truth precedence

1. Repository-local testing rules and existing test conventions.
2. Behavior promised through public APIs, CLIs, contracts, docs, requirements, or existing tests.
3. This adversarial testing doctrine.
4. Language-specific testing idioms and tools.

Coverage numbers, framework choice, and test count do not prove correctness. Language style does not excuse weak evidence.

## Core doctrine

Tests are executable evidence.

A test is strong when it would fail for a realistic regression in observable behavior. A test is weak when it mostly proves that code runs, mocks were called, values exist, snapshots changed, or the implementation mirrors itself.

Prefer tests that exercise stable behavior through public or intended seams. Avoid findings about private helper structure unless the tests are so coupled to internals that behavior-preserving refactoring would break them.

## Review focus

Check that tests:

- prove each relevant requirement and important scenario through observable behavior
- would fail for plausible regressions in success, error, boundary, adversarial, compatibility, migration, permission, persistence, concurrency, and retry paths where relevant
- exercise public or stable internal seams rather than private implementation choreography
- use semantic assertions, not truthiness, existence, assignment, call count, or mock-return tautologies
- keep fixtures minimal, realistic, deterministic, and easy to run frequently
- avoid mocks unless the seam is a real boundary or nondeterminism must be controlled
- use snapshots only for stable structured output that reviewers can understand
- use property tests when invariants matter and consider fuzzing for hostile or highly variable input
- do not shape production architecture around mock ceremony or weaken behavior to make tests pass

For spec-driven changes, also map coverage explicitly:

- Enumerate every changed spec requirement and scenario from `specs/**/*.md`
- For each requirement/scenario, identify the corresponding test file, test case name, and concrete assertion or observable behavior being checked
- Mark each requirement/scenario as covered, partially covered, weakly covered, or uncovered
- If a requirement has multiple important success, failure, permission/security, boundary, edge, compatibility, or migration cases, verify that tests cover the relevant cases instead of only the happy path

## Findings to hunt

- Tautologies: expected values computed through the same code path, value equals itself, mock returns configured value, construction-only checks, assignment checks, or call-order assertions with no meaningful outcome.
- Happy-path-only coverage: missing invalid, empty, huge, duplicate, malformed, reordered, missing, conflicting, permission, not-found, timeout, rollback, retry, compatibility, or concurrency cases where behavior needs them.
- Requirement gaps: behavior promised by docs, contracts, issues, public APIs, CLIs, generated outputs, migrations, or specs is not tested.
- Missing requirement-to-test mapping: changed spec requirements or scenarios are not tied to test files, test names, and concrete assertions.
- Implementation mirroring: tests coupled to private helper shape, incidental snapshots, mock choreography, or internal data structures that break when behavior-preserving simplification happens.
- Weak assertions: broad truthiness, type-only checks, length-only checks when content matters, ignored error details, missing ordering checks, over-allowed ordering when order matters, or broad exception matching.
- Missing adversarial tests: malformed serialized data, invalid Unicode, path traversal, shell metacharacters, extreme numbers, clock/time-zone boundaries, duplicate IDs, stale state, resource exhaustion, or dependency partial failures.
- Missing property tests: round trips, idempotence, ordering, merge laws, permission monotonicity, accounting totals, state transitions, deduplication, pagination, filtering equivalence, or parser/serializer invariants.
- Missing fuzzing: parsers, decoders, deserializers, validators, interpreters, shell/path/URL handling, protocols, auth tokens, or stored external payloads.
- Snapshot misuse or gaps: noisy nondeterministic snapshots, snapshots replacing semantic assertions, huge unreadable snapshots, or missing snapshots for stable complex output where hand assertions are too sparse.
- Mock damage: mocks replacing deterministic code, hiding real dependency contracts, asserting choreography, or forcing interfaces that damage architecture.
- Flaky or slow feedback: tests depend on wall-clock timing, real external services, global state, non-isolated filesystem paths, order-dependent data, or nondeterministic concurrency without control.
- Missing failure evidence: important errors, panics, rollback behavior, cleanup, permissions, and partial failures are not asserted.

## Language adaptation

- Rust: inspect `#[test]`, async tests, property tests, fuzz targets, panic expectations, temp files, snapshots, integration tests, and `.unwrap()` where failure details matter.
- TypeScript: inspect unit/integration split, spies, mocks, snapshots, generated fixtures, validation cases, server/client seams, fake timers, and async failure paths.
- Go: inspect table-driven case diversity, fuzz tests for parsers/validators, benchmarks only for performance claims, race-sensitive tests, and interfaces introduced only for tests.
- Python: inspect parametrization, Hypothesis/property tests, monkeypatching, fixture scope, temp files, broad patches, and tests that hide integration behavior.
- Bash: inspect exit status, stdout/stderr, quoting, paths with spaces, shell metacharacters, missing tools, failing commands, and destructive operations.

## Workflow

1. Identify behavior promised by the implementation under review, related codebase behavior, public surfaces, docs, requirements, and existing contracts.
2. Inventory tests that claim to cover that behavior.
3. Map requirements and scenarios to test files, test names, fixtures, snapshots, generated outputs, and concrete assertions.
4. Compare tested cases against realistic normal, edge, failure, adversarial, compatibility, permission, persistence, concurrency, and retry cases.
5. Inspect assertions, mocks, fixtures, snapshots, generated data, and CI output for real evidence.
6. Decide whether property tests, fuzzing, snapshots, integration tests, or contract tests are missing or misused.
7. Identify architecture damage caused by testing choices.
8. Classify each suspicious item as blocker, concern, suggestion, acceptable tradeoff, or keep-as-is.
9. Return concise findings only.

## Severity standard

- `blocker`: must fix because a requirement/scenario is uncovered, only tautologically covered, lacks a meaningful assertion for required behavior, or because serious correctness/security/data-loss/auth/parser/persistence/contract failure, weakened behavior, or repository-rule violation can survive.
- `concern`: should fix or explicitly accept because coverage exists but is partial, brittle, over-mocked, too happy-path-only, not adversarial enough for an important risk, missing property tests for important invariants, missing fuzzing for risky input, or missing plausible regression tests.
- `suggestion`: optional hardening when evidence does not show material risk.

## Required output

No grids or tables. Return concise findings using this structure:

```md
## Executive summary

- Highest-risk test gaps first.
- No praise for test existence.
- No filler.

## Severity rubric used

- blocker: must fix before acceptance.
- concern: should fix or explicitly accept as debt.
- suggestion: optional hardening.

## Findings

### 1. Short finding title

Severity: blocker
Category: test quality
Rule reference: repository rule, promised behavior, or testing doctrine
Location: test file, production file, behavior, or missing test area
Evidence: <evidence>
Problem: what the test suite fails to prove
Bug that can survive: concrete failure mode
Recommended remediation: specific stronger test approach
Scope: local or cross-cutting
Confidence: high, medium, or low

## Coverage and gap map

List major behaviors reviewed and whether tests prove normal, edge, failure, and adversarial cases. For spec-driven changes, include a requirement-to-test coverage map with file paths, test names, concrete assertions, and the smallest concrete remediation for each blocker or concern.

## False positives / keep as-is

List suspicious-looking tests that are justified and why.
```

If no issues are found, return `No issues found` after the coverage and gap map.
