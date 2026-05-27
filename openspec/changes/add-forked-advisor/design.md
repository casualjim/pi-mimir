## Context

`packages/advisor/` currently contains only a placeholder `package.json`, while the workspace already assumes a separate advisor package alongside `packages/pi-mimir` and `packages/pi-codebase-memory`. The closest donor is `@juicesharp/rpiv-advisor`, but that package consults its reviewer model with an in-process `completeSimple` call over the resolved parent session context.

For pi-mimir, that execution model is the wrong fit. The workspace already treats advisor behavior as a distinct lane that should run as its own session, not as a side-call on the executor branch. The desired consultation model is a forked child advisor session that inherits the parent branch context, uses a stronger configured model, and returns only advisory guidance back to the parent executor.

Constraints:
- The user explicitly wants forked child behavior, not fresh-context review.
- The advisor package must preserve the simple `/advisor` configuration UX from rpiv-advisor.
- Advisor consultation must not recurse through `advisor()` again from inside the child lane.
- pi-mimir already prefers codebase-memory-first discovery and review-oriented agent patterns.

## Goals / Non-Goals

**Goals:**
- Turn `packages/advisor/` into a real Pi package with advisor configuration, persistence, and runtime behavior.
- Reuse rpiv-advisor's proven UI/configuration patterns where they still fit.
- Replace the in-process consultation engine with a forked child advisory session.
- Ensure advisor child sessions have a stable advisory contract and cannot recurse through the advisor tool.
- Keep the implementation coherent with pi-mimir's existing package/workspace conventions and test style.

**Non-Goals:**
- Reworking pi-mimir's main plan/implement/review workflow.
- Turning advisor into an automatic review gate or mandatory workflow step.
- Preserving byte-for-byte behavioral parity with rpiv-advisor's `completeSimple` payload path.
- Adding commit, PR, archive, or branch-finishing behavior.

## Decisions

### D1: Reuse rpiv-advisor's shell, replace its engine
Import the package structure and proven surface area from `@juicesharp/rpiv-advisor` where it still fits:
- persisted advisor selection
- effort selection
- off-by-default activation
- per-executor blocklist behavior
- `/advisor` command UX

Replace the consultation core entirely. pi-mimir's advisor tool will not call `completeSimple()` with serialized parent context. Instead it will launch a forked advisory child session and return that session's advisory output.

**Why:** This preserves the mature user-facing behavior while aligning execution with the workspace's intended subagent/session isolation model.

**Alternative:** Copy rpiv-advisor as-is and keep `completeSimple`. Rejected because it preserves the wrong execution boundary for this repo.

### D2: Use a dedicated packaged advisor child agent, not a generic oracle wrapper
The advisor package will sync a bundled advisor child agent into `.pi/agents/` and invoke that specific agent for consultations.

The agent will:
- default to forked context
- inherit project context
- avoid inheriting unrelated skills
- expose only a read-only tool surface needed for advisory validation
- omit the `advisor` tool entirely
- use a strict advisory prompt contract: return plan, correction, or stop guidance only

**Why:** A dedicated agent gives the package a stable contract, stable tool boundary, and an explicit recursion guard. It also avoids coupling behavior to future changes in a generic builtin oracle agent.

**Alternative:** Invoke the builtin `oracle` agent with a task prompt. Rejected because its contract and tool surface are looser, and recursion/tool exclusion becomes harder to guarantee.

### D3: Keep advisor child sessions read-only and guidance-only
The advisor child should be able to inspect inherited context and, when needed, verify with read-only tools such as `read` and codebase-memory discovery tools. It must not perform implementation or user-facing workflow actions.

The child output contract is limited to:
- **plan**: concrete next steps for the parent
- **correction**: redirect the parent away from a wrong path
- **stop**: tell the parent to halt and escalate to the user

**Why:** The advisor is a second-opinion lane, not a second executor. Read-only inspection is acceptable because it strengthens advice without blurring ownership.

**Alternative:** Give the child no tools at all. Rejected because a forked session can benefit from light read-only verification when inherited context is insufficient, and pi-mimir already prefers grounded codebase inspection.

### D4: Mirror pi-mimir's managed-agent syncing pattern inside the advisor package
The advisor package should bundle its child agent definition in-package and sync it into `.pi/agents/` using the same manifest-based ownership strategy already used by `packages/pi-mimir/extensions/openspec/agents.ts`.

**Why:** This keeps agent delivery deterministic, supports updates, and avoids asking users to hand-install or hand-maintain an advisor child agent.

**Alternative:** Require the user to install or create the advisor agent separately. Rejected because it makes the package incomplete by default and increases setup drift.

### D5: Treat missing fork/subagent support as an explicit advisor failure mode
The package should detect and surface missing prerequisites for forked advisory execution, such as unavailable subagent tooling or inability to start the child run, as structured advisor errors rather than silent no-ops.

**Why:** rpiv-advisor's failure modes were mostly auth/model issues; this package adds a new execution dependency and needs explicit failure reporting.

**Alternative:** Fall back silently to in-process `completeSimple`. Rejected because it would violate the core design choice and create two incompatible advisor semantics.

### D6: Keep package-level changes localized to `packages/advisor/` plus workspace/docs/tests
Most implementation should live in `packages/advisor/`. Cross-package changes should be limited to what is required for workspace registration, documentation, and tests.

**Why:** The advisor remains a supporting package, not a rewrite of pi-mimir's core extension.

**Alternative:** Fold advisor behavior into `packages/pi-mimir`. Rejected because the workspace already chose a separate advisor package boundary.

## Risks / Trade-offs

- **Forked child still inherits full branch history** → This is intentional, but it means advisor does not reduce context scope; it only changes the execution boundary. Mitigation: be explicit in docs and prompt design that the value is isolation, not narrower context.
- **Managed child agent adds package complexity** → Sync logic and manifests duplicate an existing pattern. Mitigation: reuse the proven manifest-based syncing approach already present in the workspace.
- **Read-only child tooling may still broaden cost** → A stronger model plus forked session can cost more than a side-call. Mitigation: keep the child read-only, concise, and opt-in.
- **Subagent/fork execution becomes a hard dependency** → Advisor may fail when subagent support is missing or misconfigured. Mitigation: surface clear errors and prerequisites instead of degrading silently into a different engine.
- **Generic oracle behavior diverges from advisor needs** → Avoided by shipping a dedicated advisor child agent instead of binding to a looser builtin role.

## Migration Plan

1. Populate `packages/advisor/` with the imported/adapted extension modules, prompts, bundled child agent, docs, and tests.
2. Add or adjust any workspace dependencies required for the package's configuration UI, managed-agent syncing, and forked advisory execution.
3. Register and test package behavior in the workspace so sessions can configure and invoke the advisor package.
4. Validate the main flows: unconfigured state, configured state, disabled state, blocklisted executor state, successful forked consultation, and failed consultation.
5. Rollback strategy: remove the populated advisor package contents and any related workspace registrations, returning `packages/advisor/` to a placeholder or removing it entirely.

## Open Questions

- None at proposal time. The main product decision—forked child behavior instead of in-process side-call—has been made.
