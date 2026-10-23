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

### Defaults

A missing or malformed `settings.json` is not an error: every setting falls back to its default. Invalid values fall back the same way.

| Setting | Default | Notes |
| --- | --- | --- |
| `enabled` | `true` | |
| `backend` | `"typesafe"` | `https://api.typesafe.ai/v1/systemone`, key from `TYPESAFE_API_KEY` |
| `model` | none | the registry backend supplies `jev-latest` |
| `timeoutMs` | `1500` | bounded to 100–30000; out-of-range values reset to 1500 |
| `capture` | `"balanced"` | unknown preset names reset to `balanced` |
| `policies` | `[]` | |
| `questions` | `[]` | |

`typesafe` and `openrouter` also reuse the key the agent runtime already holds: at session start pi-dredd asks the host's model registry (`/login`, stored credentials) when neither a settings `apiKey` nor the backend's `keyEnv` variable resolves one. So a `typesafe` key added through `/login` needs no `settings.json` and no env var. Resolution order: settings `apiKey` → `keyEnv` env var → host registry.

A custom endpoint may take any of these independently: its own `keyEnv` var, a `provider` id naming a host credential (e.g. `"provider": "openrouter"`), or neither when the judge is keyless. Add `provider` and the host's stored key authenticates that endpoint too.

With nothing resolvable, judged calls have no key: the gate fails open and the offline floor still holds the destructive commands. To point pi-dredd at your own judge server, set a custom `backend` — no settings beyond that are required.

A full settings file:

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
  "defaultModel": "our-decision-model",
  "provider": "openrouter"
}
```

`host` is any absolute origin; scheme is your choice. `keyEnv` names the env var holding the key and must not be `TYPESAFE_API_KEY`; omit it for a keyless server, and no auth header is sent. Without `defaultModel`, pass `"model"` per request in settings. `timeoutMs` is the per-batch budget; the skill picker multiplies it by the batch count (capped at 15s), so a remote judge slower than the default 1500ms needs a larger value.

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