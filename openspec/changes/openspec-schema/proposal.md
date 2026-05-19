## Why

The review-gated OpenSpec schema asset currently uses fields and structure that do not match OpenSpec's actual schema format, so the package cannot rely on it as a valid workflow definition. This needs to be isolated from the broader workflow reframe so the schema asset can be corrected, validated, and reviewed independently.

## What Changes

- Replace the invalid `review-gated` schema definition with a valid OpenSpec schema shape modeled on the built-in `spec-driven` schema.
- Move schema behavior into the correct ownership surfaces:
  - `schema.yaml` owns artifact graph, dependencies, template references, and inline artifact/apply instructions.
  - `templates/*.md` own markdown skeletons and examples only.
  - archive, ADR, setup, agent orchestration, and review-skill behavior remain outside the schema definition unless OpenSpec provides a supported hook.
- Clarify how review-gated instructions are represented without inventing unsupported top-level schema fields.
- Add validation expectations that prove the schema parses and produces useful OpenSpec instructions before implementation uses it.

## Capabilities

### New Capabilities
- `review-gated-schema-definition`: Defines the valid OpenSpec schema shape and ownership boundaries for the package's `review-gated` workflow asset.
- `review-gated-schema-validation`: Defines validation behavior for proving the corrected schema is parseable, instruction-bearing, and scoped to schema/template assets.

### Modified Capabilities
_(none — no accepted specs currently exist in this repository)_

## Impact

- **OpenSpec schema asset**: `packages/pi-openspec/openspec/schemas/review-gated/schema.yaml` must be rewritten to use OpenSpec's supported schema fields and artifact array structure.
- **Schema templates**: `packages/pi-openspec/openspec/schemas/review-gated/templates/{proposal,spec,design,tasks}.md` may be refined as skeletons/examples, but should not carry orchestration policy.
- **Apply/archive template files**: `templates/apply.md` and `templates/archive.md` need an ownership decision because the current schema cannot wire them via unsupported `instructions` or `archive` fields.
- **Out of scope**: planner/worker agents, review skills, setup commands, managed manifests, package registration, and documentation changes unrelated to the schema asset.
