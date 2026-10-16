# pi-dredd

Judge-everything guard extension for [Pi](https://pi.dev) and omp. The combination of pi-warden's guards and ohmyjev's speed features, with its own decisions client: no pi-typesafe dependency, a first-class violation ledger, direct-trust memory, and a pluggable question registry.

## What it fixes

| pi-warden behavior | pi-dredd behavior |
| --- | --- |
| `warden_remember` records a lesson but waits for a second session to confirm it | `dredd_remember` records and enforces in the same call |
| Issues detected but not steered disappear into a trace file | Every detected violation lands in a SQLite ledger, visible via `/dredd violations` |
| Read-only calls never reach the judge; a steer budget caps visibility at 3 per run | `capture: "recall"` judges every guarded call and records everything |
| The violation taxonomy (slop, security, causes) is hardcoded | User-registered questions in `settings.json` extend the taxonomy |
| Judge goes to api.typesafe.ai via pi-typesafe | Own wire client; any Jev-protocol endpoint, including your local decision model |

## Settings

`PI_DREDD_SETTINGS` (exact file) → `PI_CODING_AGENT_DIR/dredd/settings.json` → `~/.omp/agent/dredd/settings.json` under omp, `~/.pi/agent/dredd/settings.json` under pi.

```jsonc
{
  "enabled": true,
  "backend": "typesafe",
  "capture": "balanced",
  "timeoutMs": 1500,
  "policies": ["never push to main"],
  "questions": [
    { "id": "migrationRan", "type": "noul",
      "instructions": "Does this diff edit a migration that already ran?",
      "threshold": 0.7, "appliesTo": "call" }
  ]
}
```

### Backend

`"typesafe"` (default, key from `TYPESAFE_API_KEY`), `"openrouter"` (key from `OPENROUTER_API_KEY`), or a custom endpoint object for any server that speaks the Jev decisions protocol (`POST {model, state, questions}` → `{answers, usage}`):

```jsonc
"backend": {
  "label": "local judge",
  "host": "http://localhost:8080",
  "path": "/v1/systemone",
  "keyEnv": "LOCAL_JUDGE_KEY",
  "defaultModel": "our-decision-model"
}
```

`host` must be https unless loopback. `keyEnv` is required and must not be `TYPESAFE_API_KEY`. Without `defaultModel`, pass `"model"` per request in settings.

### Capture presets

| Preset | Behavior |
| --- | --- |
| `strict` | Warden-like: offline ask-gate skips read-only calls, steer budget 3 |
| `balanced` | Default: ask-gate on, no steer cap, everything recorded |
| `recall` | Every guarded call judged, everything recorded and surfaced |

## Development

```bash
pnpm install
pnpm test        # hermetic vitest suite
pnpm typecheck   # tsc --noEmit
```

MIT licensed.