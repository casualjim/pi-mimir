---
name: setup-pstack
description: Configure the Pi models pstack delegates to by role, and the reasoning budget. Use for /setup-pstack, "configure pstack models", "pstack budget", or changing pstack's model choices.
disable-model-invocation: true
---

# Set up pstack for Pi

Use `/setup-pstack` to open the Pi-native interactive model picker. It lists models configured for this Pi session and writes the chosen role mappings to `~/.pi/agent/pstack/models.json`.

If interactive UI is unavailable, call `pstack_config` with `action: "list-models"`, then set each needed role with `action: "set"`. Values use Pi's `provider/model` selector format. Set a role to `inherit-parent` to run that child with the parent session's selected model.

## Budget

A "pstack budget" answer picks one of `unlimited` (keep max), `large` (xhigh reasoning), `medium` (high reasoning), or `small` (medium reasoning). Apply it by choosing each role's model (and, where the harness exposes a thinking level for spawned subagents, that level) at or below the chosen tier, keeping `inherit-parent` entries unchanged. Record the budget as a `budget` field in `~/.pi/agent/pstack/models.json` so later runs reuse it.

## Rules

- Never write an unlisted model selector.
- Start with `inherit-parent` for any role without a deliberate model choice.
- Panel roles can be configured as an array only by editing the JSON deliberately. Each entry means one subagent.
- Re-run `/setup-pstack` whenever models or provider access changes.

## Verification skill offer

After saving the role mappings, `/setup-pstack` looks for a way to prove app behavior in the current project: a `.pi/skills/verify-*` skill or a recognized test harness (vitest, jest, playwright, cypress, pytest, cargo, go, a `package.json` `test` script, a `Makefile` `test:` target, and similar). If it finds neither, it asks once whether to generate a project verification skill via `/skill:create-verification-skill`. Accept and that skill takes over; decline and setup moves on. You can run `/skill:create-verification-skill` yourself any time. The offer is interactive only; in non-interactive Pi it is skipped.

The config is user-level and applies to every later pstack session. It is not repository configuration and must not be committed.
