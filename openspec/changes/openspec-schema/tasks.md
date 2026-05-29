## 1. Repair Schema Definition

- [x] 1.1 Rewrite `packages/pi-mimir/openspec/schemas/review-gated/schema.yaml` to use OpenSpec's supported `name`, `version`, `description`, `artifacts`, and `apply` structure
- [x] 1.2 Convert artifact definitions from a map to an array with `id`, `generates`, `description`, `template`, `instruction`, and `requires`
- [x] 1.3 Encode the intended dependency graph: `proposal` first, `specs` and `design` after proposal, `tasks` after specs and design
- [x] 1.4 Replace unsupported `apply.instructions` with `apply.requires`, `apply.tracks`, and inline `apply.instruction`
- [x] 1.5 Remove unsupported top-level `summary`, `archive`, and `rules` schema fields

## 2. Place Guidance in Correct Owners

- [x] 2.1 Add proposal-specific review-gated guidance to `proposal.instruction`
- [x] 2.2 Add specs-specific review-gated guidance to `specs.instruction`
- [x] 2.3 Add design-specific review-gated guidance to `design.instruction`
- [x] 2.4 Add tasks-specific review-gated guidance to `tasks.instruction`
- [x] 2.5 Add apply-phase guidance to `apply.instruction`, including incremental task execution, verification, review gates, archive readiness, and no commits

## 3. Reconcile Templates

- [x] 3.1 Review `templates/proposal.md`, `templates/spec.md`, `templates/design.md`, and `templates/tasks.md` for skeleton/example quality
- [x] 3.2 Keep templates limited to markdown structure and examples, not setup, agent dispatch, archive, or review-skill implementation policy
- [x] 3.3 Decide whether useful content from `templates/apply.md` should be folded into `apply.instruction` or retained outside schema wiring
- [x] 3.4 Decide whether `templates/archive.md` should move to documentation or a supported archive/sync instruction surface outside `schema.yaml`

## 4. Validate Schema Behavior

- [x] 4.1 Validate the corrected `review-gated` schema with OpenSpec's schema parser or schema validation command
- [x] 4.2 Create or use a temporary change with `schema: review-gated` to verify `openspec status --change <name> --json` reports the expected artifact dependency states
- [x] 4.3 Verify `openspec instructions proposal/specs/design/tasks --change <name> --json` each returns template, instruction, output path, and dependency metadata
- [x] 4.4 Verify `openspec instructions apply --change <name> --json` returns task tracking and apply guidance once the temporary change is apply-ready
- [x] 4.5 Verify no unsupported fields (`summary`, `path`, `instructions`, top-level `archive`, top-level `rules`) remain in `review-gated/schema.yaml`
- [x] 4.6 Compare the corrected `review-gated` structure against `~/github/JiangWay/openspec-schemas/superpowers-bridge/schema.yaml` as a valid complex custom-schema precedent

## 5. Confirm Scope Boundaries

- [x] 5.1 Confirm the implementation diff is limited to `packages/pi-mimir/openspec/schemas/review-gated/schema.yaml` and necessary files under `packages/pi-mimir/openspec/schemas/review-gated/templates/`
- [x] 5.2 Confirm planner, worker, reviewer, review skills, setup commands, managed manifests, package registration, and unrelated docs were not modified
- [x] 5.3 Run `openspec validate openspec-schema --strict`
