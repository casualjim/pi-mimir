## 1. Package Registration and Setup

- [x] 1.1 Update `packages/pi-mimir/package.json` to register `skills/define` and `skills/deliver`
- [x] 1.2 Reuse OpenSpec archive behavior without adding an `openspec-archive` wrapper skill
- [x] 1.3 Ensure `packages/pi-mimir/package.json` does not register commit or generic planning skills
- [x] 1.4 Ensure package dependencies do not include `@juicesharp/rpiv-pi`
- [x] 1.5 Add `rpiv-btw` and `npm:pi-mcp-adapter` to `packages/pi-mimir/extensions/openspec/siblings.ts`
- [x] 1.6 Extend `/openspec-setup` to check or install `openspec` via `npm i -g @FissionAI/openspec`
- [x] 1.7 Extend `/openspec-setup` to check codebase-memory MCP availability and present a copy-paste setup prompt when missing

## 2. Definition Workflow

- [x] 2.1 Create `packages/pi-mimir/skills/define/SKILL.md` as the definition entry skill
- [x] 2.2 Create `packages/pi-mimir/agents/planner.md`
- [x] 2.3 Add OpenSpec status/instructions handling guidance to the planner
- [x] 2.4 Add codebase-memory-first discovery guidance to the planner
- [x] 2.5 Add artifact review dispatch and synthesis guidance to the planner
- [x] 2.6 Add guardrail that definition never writes application code

## 3. Delivery Workflow

- [x] 3.1 Create `packages/pi-mimir/skills/deliver/SKILL.md` as the delivery entry skill
- [x] 3.2 Create `packages/pi-mimir/agents/worker.md`
- [x] 3.3 Add OpenSpec apply-instructions handling guidance to the worker
- [x] 3.4 Add incremental task execution and checkbox update guidance to the worker
- [x] 3.5 Add verification, review dispatch, synthesis, and fix-loop guidance to the worker
- [x] 3.6 Add guardrail that delivery stops at archive readiness and never commits

## 4. Review Skills and Reviewer Persona

- [x] 4.1 Create `packages/pi-mimir/agents/reviewer.md` as the generic adversarial reviewer persona
- [x] 4.2 Create `packages/pi-mimir/skills/review-proposal/SKILL.md`
- [x] 4.3 Create `packages/pi-mimir/skills/review-specs/SKILL.md`
- [x] 4.4 Create `packages/pi-mimir/skills/review-design/SKILL.md`
- [x] 4.5 Create `packages/pi-mimir/skills/review-tasks/SKILL.md`
- [x] 4.7 Create `packages/pi-mimir/skills/review-architecture/SKILL.md`
- [x] 4.8 Create `packages/pi-mimir/skills/review-tests/SKILL.md`
- [x] 4.9 Create `packages/pi-mimir/skills/review-data-flow/SKILL.md`
- [x] 4.10 Create `packages/pi-mimir/skills/review-security/SKILL.md`
- [x] 4.11 Define a consistent finding format for artifact and implementation review skills

## 5. Codebase-Memory and OpenSpec Assets

- [x] 5.1 Update bootstrap guidance to include the codebase-memory discovery ladder
- [x] 5.2 Add degraded-discovery fallback instructions for codebase-memory failures
- [x] 5.3 Add review-gated OpenSpec schema/profile/config assets under `packages/pi-mimir/openspec/`
- [x] 5.4 Add no-commit and review-gate instructions to the OpenSpec schema/config assets
- [x] 5.5 Expand spec sync/archive guidance to include post-landing ADR update handling
- [x] 5.6 Document canonical ownership for OpenSpec artifacts, codebase-memory ADR, and optional path-scoped guidance

## 6. Setup, Manifest, and Overlap Detection

- [x] 6.1 Add extension logic to detect rpiv-pi package markers or generic overlapping skills/prompts
- [x] 6.2 Report a warning when overlap is detected
- [x] 6.3 Preserve content-addressable manifests for agents/skills/prompts and add OpenSpec asset version metadata only for OpenSpec schema/config/generated assets
- [x] 6.4 Use OpenSpec asset version markers to report stale schema, config, and generated OpenSpec assets
- [x] 6.5 Add tests for overlap detection and no-overlap behavior
- [x] 6.6 Add tests for setup dependency detection and managed manifest drift detection

## 7. Naming, Documentation, and Validation

- [x] 7.1 Run a naming pass for user-facing skills, prompts, commands, agents, and schema/profile names
- [x] 7.2 Update README usage docs using the final product names
- [x] 7.3 Add tests that package registration excludes commit and generic planning skills
- [x] 7.4 Document setup prerequisites: Pi sibling packages, OpenSpec CLI, codebase-memory MCP, and MCP adapter
- [x] 7.5 Document the copy-paste prompt shown when codebase-memory MCP is missing
- [x] 7.6 Run `openspec validate reframe-openspec-workflow --strict`
- [x] 7.7 Verify artifacts do not contain narrative-only reframing language
- [x] 7.8 Decide whether path-scoped guidance is needed after validating codebase-memory ADR behavior
