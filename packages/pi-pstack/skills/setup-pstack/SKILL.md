---
name: setup-pstack
description: Configure which models pstack uses per role and offer to generate a project verification skill. Detects your available models and writes pi-herdr-agents' task-model routing. Use for /skill:setup-pstack, "configure pstack models", "pstack budget", or first-run pstack setup.
---

# Setup pstack

Configure pi-herdr-agents' role-to-model routing through `subagents_write_task_models` (its `models.tasks`/`models.agents` config), then offer the verification skills.

## Steps

### 1. Detect available models

Enumerate the models the host exposes this session: the model registry's available models and the roles already configured in `herdr-agents/config.json`. If you cannot detect any, ask the user which models or role aliases they have. Never write a model name you have not confirmed is available. The aliases `inherit-parent` and `auto` are always valid even though they are not detected models.

### 2. Load current state

Read the current `models.tasks`/`models.agents` config via `subagents_write_task_models`. If nothing is configured, every role runs on the parent model (`inherit-parent`), which is the cheapest default. Keep any role the user already pinned; drop lines for retired roles if the config names any.

### 3. Budget, map, and confirm

Ask for a budget. Offer three options: `large` (highest thinking level the role's family supports), `medium` (one step lower), `small` (two steps lower). Show every pstack role with its model and thinking level, marking any model not in the detected set as needing a choice. Offer `inherit-parent` and `auto` too; both mean the role runs on the parent chat model. For panel roles (`arena` runners, `interrogate` reviewers) the value is a list, and one subagent runs per entry, so the list length sets the fan-out. `swarm workers` is the default model for every worker unless a race or comparison assigns another model per arm.

### 4. Validate

Every model written must be in the detected set or be an alias. If a chosen model is not available, stop and ask again.

### 5. Write the routing

Write the agreed role-to-model mapping with `subagents_write_task_models`. Panel lists go through `models.agents` per agent or `task:<category>` routing, whichever pi-herdr-agents' config shape requires. Re-running this skill updates the routing in place.

### 6. Confirm

Tell the user the routing applies to new subagent spawns and that re-running this skill updates it.

### 7. Offer a verification skill (optional)

Check whether the project has a way to drive the real app for proof (a `verify-*` skill, or an existing harness). If not, offer once: "want a project-local verification skill, so agents can drive the app the way a user does and prove changes work? I can generate one with /skill:create-verification-skill." On yes, invoke `/skill:create-verification-skill`. On no, move on without pushing.

### 8. Offer a formal verification skill (optional)

Check whether the project already has a formal verification skill (a project skill that runs a model checker, a proof, or another verifier against the code). If not, offer once: "want a formal verification skill, so agents can prove a key property of your code holds in every case in scope, not only the cases tests reach? I can generate one with /skill:create-formal-verification-skill." On yes, invoke `/skill:create-formal-verification-skill`. On no, move on without pushing.
