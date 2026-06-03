# pi-heimdall

Guardian extensions for [pi](https://github.com/badlogic/pi-mono) that protect
against accidental secret exposure through tool calls.

Named after Heimdall, watcher of the Bifröst — the one who sees everything
coming and slams the gate shut when it shouldn't pass.

Ported from the equivalent [opencode](https://opencode.ai) plugins.

## What it does

pi-heimdall ships:

- a **core Heimdall extension** (`extensions/heimdall.ts`) enabled by default
- an **optional sandboxed background-task extension** (`extensions/heimdall-bg-tasks.ts`) that you enable explicitly when you want Heimdall's safe replacement for `@ifi/pi-background-tasks`

The core extension provides six independent guards. Each one intercepts tool
calls before they run (and, in one case, after they return) and blocks or
redacts anything that would leak secrets to the LLM context.

| Guard | Type | Tool | Blocks / redacts |
|---|---|---|---|
| `sandbox-guard` | always-on | `bash` | Delegates sandboxed bash commands to the native `heimdall-sandbox` runtime using the configured native policy schema |
| `env-protect` | opt-out | `read` | Reading `.env`, `.env.*`, `.envrc`, `*.env` — except `.env.example`, `.env.sample`, `.env.template`, `.env.dist`, `.env.defaults` |
| `kubectl-secret-guard` | opt-out | `bash` | `kubectl get secrets`, `kubectl patch ... finalizers`, `kubectl exec` into a pod that dumps env / `/var/run/secrets` / `app.ini` |
| `sops-secret-guard` | opt-out | `bash` | Any `sops` invocation that would decrypt content: `sops decrypt`, `sops -d`, `sops --decrypt`, `sops exec-env`, `sops exec-file`, `sops edit`, and bare `sops <file>` |
| `command-policy-guard` | opt-out | `bash` | Commands that violate repo policy as defined in `.pi/heimdall.json` (e.g. blocking `cargo test` in favour of `mise test`) |
| `secret-guard` | opt-out | `bash` | Commands that reference secret env var names from a project `.env.json`, and redacts their values from bash output (plaintext, base64, rot13, reversed, hex, and hexdump-decoded) |

`sandbox-guard` is always-on when enabled in config. The other five are opt-out
via the `disabled` array (see below).

The optional background-task extension adds sandboxed `bg_task`, `bg_status`,
`/bg`, and `Ctrl+Shift+B` compatibility without changing ordinary foreground
`bash` behavior.

## Install

### Global (all projects)

```bash
pi install git:github.com/casualjim/pi-heimdall
```

### Project-local

```bash
pi install -l git:github.com/casualjim/pi-heimdall
```

Project-local installs land in `.pi/settings.json` and are picked up
automatically for every run in that directory.

### From a local clone

```bash
git clone https://github.com/casualjim/pi-heimdall ~/src/pi-heimdall
pi install ~/src/pi-heimdall
```

### Try without installing

```bash
pi -e git:github.com/casualjim/pi-heimdall
```

## Optional background-task extension

A normal `pi install` of `@casualjim/pi-heimdall` enables only the core
Heimdall extension.

To enable Heimdall's optional sandboxed background-task replacement, use `pi
config` and enable the `heimdall-bg-tasks.ts` extension resource for this
package, or edit settings manually.

Example user settings:

```json
{
  "packages": [
    {
      "source": "npm:@casualjim/pi-heimdall",
      "extensions": [
        "+extensions/heimdall.ts",
        "+extensions/heimdall-bg-tasks.ts"
      ]
    }
  ]
}
```

To keep the package installed but disable the background-task extension again:

```json
{
  "packages": [
    {
      "source": "npm:@casualjim/pi-heimdall",
      "extensions": [
        "+extensions/heimdall.ts",
        "-extensions/heimdall-bg-tasks.ts"
      ]
    }
  ]
}
```

The background-task extension does **not** need an extra
`backgroundTasks.enabled` config flag. Enabling the extension resource is
sufficient.

### Background-task compatibility notes

Heimdall's background-task extension follows the public `@ifi/pi-background-tasks`
surface, but intentionally differs in a few safety-critical ways:

- every task launches through `heimdall-sandbox exec --policy -`
- launch fails closed when sandboxing is disabled, unavailable, or misconfigured
- background commands run Heimdall command preflight checks before launch
- model-visible task output is redacted with the same secret redaction used for foreground `bash`
- task logs are written to private Heimdall runtime storage instead of public temp paths

## Troubleshooting

### `@ifi/pi-background-tasks` conflicts

Heimdall's optional background-task extension intentionally uses the same public
names as `@ifi/pi-background-tasks`:

- `bg_task`
- `bg_status`
- `/bg`
- `Ctrl+Shift+B`

That conflict is intentional. Heimdall's implementation is meant to be the safe
replacement when you require sandboxed background execution.

If you enable `extensions/heimdall-bg-tasks.ts`, disable the upstream
`@ifi/pi-background-tasks` extension/package resource so Pi does not load both
implementations at once.

### oh-pi conflicts

When Heimdall is installed alongside `oh-pi`, pi may fail at startup with a
conflict similar to:

```text
Tool "bash" conflicts with .../oh-pi/pi-package/extensions/bg-process.ts
```

This happens because Heimdall's `sandbox-guard` wraps pi's built-in `bash` tool
so commands can run through the sandbox policy, while `oh-pi`'s `bg-process.ts`
also overrides `bash` to auto-background long-running commands. Pi allows an
extension to override a built-in tool, but two installed packages cannot both
register a custom tool with the same name.

To use Heimdall and `oh-pi` together, disable only `oh-pi`'s `bg-process.ts`
extension while keeping the rest of `oh-pi` enabled:

```bash
pi config
```

Then uncheck:

```text
npm:oh-pi → Extensions → bg-process.ts
```

Or edit `~/.pi/agent/settings.json` manually:

```json
{
  "packages": [
    {
      "source": "npm:oh-pi",
      "extensions": ["-pi-package/extensions/bg-process.ts"]
    },
    "npm:@casualjim/pi-heimdall"
  ]
}
```

Omitted resource types still load normally, so this keeps `oh-pi` skills,
prompts, themes, and other extensions enabled. The only disabled piece is the
`bg-process.ts` extension and the `bg_status` tool it registers.

## Configuration

Config files may be JSONC (comments and trailing commas) or legacy JSON. For each level, Heimdall prefers `.jsonc` and falls back to `.json` only when the `.jsonc` file is absent. Levels are deep-merged in this order, so later levels override earlier values and append arrays:

- **Generated defaults**: `~/.pi/agent/heimdall.default.jsonc`
- **User-level**: `~/.pi/agent/heimdall.jsonc` (fallback: `heimdall.json`)
- **Project-level**: repo root `.pi/heimdall.jsonc` (fallback: `heimdall.json`)

Opt-out guards are enabled by default. Native sandbox delegation remains disabled unless `sandbox.enabled` is set to `true`. Disable individual opt-out guards via the
`disabled` array:

```jsonc
{
  // These guard IDs are opt-out.
  "disabled": ["env-protect", "kubectl-secret-guard"],
  "sandbox": { "enabled": true },
  "commandPolicies": [],
}
```

## Configuring `sandbox-guard`

`sandbox-guard` delegates sandboxed `bash` commands to the native
`heimdall-sandbox` runtime. Heimdall keeps only the Pi integration concerns:
`enabled` turns delegation on/off, `binaryPath` optionally points to the
native binary, `--no-sandbox` disables it for a session, and each bash
invocation is wrapped as `heimdall-sandbox exec --policy -` with a per-command
JSON policy on stdin.

Host-side Pi tools such as `read`, `write`, `edit`, `grep`, `find`, and
`ls` are not constrained by the native process sandbox. Use the other Heimdall
guards for host-tool secret protection, and configure `heimdall-sandbox` for
commands run through `bash`.

**Requirements:** an installed `heimdall-sandbox` binary. Heimdall first uses
`sandbox.binaryPath` when set, then `heimdall-sandbox` on `PATH`. If the default
binary is missing, Heimdall warns with install guidance and sandboxed commands
will fail clearly rather than running unsandboxed.

Install options include Homebrew from the casualjim tap, npm install of
`@casualjim/heimdall-sandbox`, or `npx @casualjim/heimdall-sandbox`.

### Minimal config

```json
{
  "sandbox": {
    "enabled": true
  }
}
```

### Native policy config

Heimdall refreshes `~/.pi/agent/heimdall.default.jsonc` on startup with visible recommended defaults. The file is generated, may be overwritten, and exists for transparency; put local changes in `heimdall.jsonc` or project config instead. The generated defaults keep `sandbox.enabled` set to `false` and include the recommended private-path `sandbox.filesystem.deny` list.

All fields under `sandbox` except `enabled`, `binaryPath`, and `useDefaultFilesystemDeny` use the native `heimdall-sandbox` policy schema and are copied into the generated per-command policy. Runtime-only fields (`cwd`, `command`, and `stdio`) are added by Heimdall for each command. Set `sandbox.useDefaultFilesystemDeny: false` in user or project config to remove only the generated recommended deny entries while keeping explicit `sandbox.filesystem.deny` entries and `.heimdall-deny` fragments active. Host agent socket mounts are opt-in; set `gpgAgent: true` for GnuPG/keyboxd/dirmngr sockets, `sshAgent: true` for `SSH_AUTH_SOCK`, or `ageAgent: true` for age-compatible sockets.

```json
{
  "sandbox": {
    "enabled": true,
    "binaryPath": "/opt/homebrew/bin/heimdall-sandbox",
    "network": "host",
    "proc": "default",
    "gpgAgent": true,
    "env": {
      "deny": ["GITHUB_TOKEN", "AWS_SECRET_ACCESS_KEY"]
    },
    "filesystem": {
      "deny": ["**/.env*", "!**/.env.example"],
      "writable": ["."],
      "virtual": {
        "/etc/hosts": "127.0.0.1 localhost\n"
      }
    }
  }
}
```

For a command like `npm test` from `/repo`, Heimdall sends a policy shaped
like:

```json
{
  "network": "host",
  "proc": "default",
  "gpgAgent": true,
  "env": { "deny": ["GITHUB_TOKEN", "AWS_SECRET_ACCESS_KEY"] },
  "filesystem": {
    "deny": ["**/.env*", "!**/.env.example"],
    "writable": ["."],
    "virtual": { "/etc/hosts": "127.0.0.1 localhost\n" }
  },
  "cwd": "/repo",
  "command": ["bash", "-c", "npm test"],
  "stdio": "piped"
}
```

### Migration from the previous schema

If your config uses any of these fields, update to the native policy fields:

| Previous field | Native replacement |
|---|---|
| `paths` entries with `mode: "deny"` | `filesystem.deny` patterns |
| `paths` entries with `mode: "write"` | `filesystem.writable` patterns |
| `paths` entries with `content` | `filesystem.virtual` entries |
| `networkAccess: false` | `network: "none"` |
| `envAllowlist` / glob allowlists | native `env.allow` exact names |
| `env.deny` glob patterns | native `env.deny` exact names |
| `env.set` | set environment outside the sandbox policy |
| `writableRoots`, `systemPaths`, `etcReal`, `etcSynthetic`, `extraReadPaths` | native `filesystem` policy fields |

Previous config:

```json
{
  "sandbox": {
    "enabled": true,
    "networkAccess": false,
    "paths": {
      ".": { "mode": "write" },
      "**/.env*": { "mode": "deny" },
      "/etc/passwd": { "content": "nobody:x:65534:65534:Nobody:/nonexistent:/usr/sbin/nologin\n" }
    },
    "env": {
      "deny": ["*_TOKEN"],
      "set": { "NO_COLOR": "1" }
    }
  }
}
```

Native config:

```json
{
  "sandbox": {
    "enabled": true,
    "network": "none",
    "filesystem": {
      "writable": ["."],
      "deny": ["**/.env*"],
      "virtual": {
        "/etc/passwd": "nobody:x:65534:65534:Nobody:/nonexistent:/usr/sbin/nologin\n"
      }
    },
    "env": {
      "deny": ["GITHUB_TOKEN"]
    }
  }
}
```

### Session controls

- **Disable for a session:** `pi --no-sandbox`
- **Check status:** `/sandbox` command in the TUI
- **Override binary path:** set `sandbox.binaryPath`
- **Disable generated private-path denies:** set `sandbox.useDefaultFilesystemDeny: false`

## Configuring `command-policy-guard`

`command-policy-guard` reads repo-specific command policies from
repo root `.pi/heimdall.jsonc` (or legacy `.pi/heimdall.json`). If `commandPolicies` array missing or empty, guard does nothing.

Example:

```json
{
  "commandPolicies": [
    {
      "name": "no-cargo-test",
      "blocked": ["cargo", "test"],
      "message": "Use `mise test` or `mise run test` instead of `cargo test`."
    },
    {
      "name": "no-cargo-nextest",
      "blocked": ["cargo", "nextest"],
      "message": "Use `mise test` or `mise run --force test` instead of `cargo nextest`."
    }
  ]
}
```

Each policy has three fields:

- **`name`** — a human-readable identifier used in block messages.
- **`blocked`** — an array of tokens that must appear at the start of a command.
  Prefix matching is used, so `["cargo", "test"]` blocks `cargo test`,
  `cargo test --lib`, `cargo test foo::bar`, etc.
- **`message`** — the explanation shown to the model when a command is blocked.

The command line is properly tokenized (respecting single quotes, double quotes,
and backslash escapes) and each shell segment (commands separated by `;`, `|`,
`&&`, `||`, or newlines) is checked independently.

### Bypass hardening

The guard handles several patterns a motivated LLM might try:

- **Env prefixes**: `CARGO_TARGET_DIR=/tmp cargo test` — `KEY=value` tokens
  before the command are skipped.
- **Wrapper commands**: `sudo cargo test`, `env cargo test`, `eval cargo test` —
  known wrappers are skipped before matching.
- **Shell groups**: `{ cargo test; }`, `( cargo test )` — `{` and `(` prefix
  tokens are skipped.
- **Shell `-c` recursion**: `bash -c 'cargo test'` — the `-c` argument is
  recursively parsed through the full pipeline (segments, heredocs, policies).
- **Path-qualified commands**: `/usr/bin/cargo test`, `~/.cargo/bin/cargo test` —
  basename matching resolves `cargo` from any path.
- **Backslash escapes**: `car\go test` — escapes are consumed during
  tokenization so the result matches `cargo`.
- **Quote splicing**: `ca''rgo test`, `ca""rgo test` — empty quotes are
  stripped during tokenization.
- **Heredocs**: `cat <<EOF\ncargo test\nEOF` — heredoc bodies are excluded
  from matching to avoid false positives.

### Known acceptable gaps

Some patterns cannot be caught without a full shell interpreter:

- `timeout 60 cargo test` — wrappers that take arguments before the command
- `docker run cargo test`, `ssh host cargo test` — indirect execution
- `python3 -c "os.system('cargo test')"` — embedded language execution
- `nix develop -c cargo test` — tool-specific wrappers

## Configuring `secret-guard`

`secret-guard` needs a `.env.json` at your project root listing the environment
variables that should be treated as secrets. **Values in the JSON are ignored —
only the keys matter.** The actual secret values are captured from `process.env`
when pi starts.

```json
{
  "GITHUB_TOKEN": "",
  "OPENAI_API_KEY": "",
  "STRIPE_SECRET_KEY": "",
  "AWS_SECRET_ACCESS_KEY": ""
}
```

With this in place:

- Any bash command that mentions `GITHUB_TOKEN` as a whole word is blocked.
- Any bash output containing the actual value of `GITHUB_TOKEN` (in plaintext,
  base64, rot13, reversed, raw hex, or hexdump form) is replaced with
  `[REDACTED]`.

Even without `.env.json`, `secret-guard` still applies a generic
trailing-pattern redaction: anything matching `*(SECRET|KEY|TOKEN|PASSWORD|PASS|APIKEY|CREDENTIAL|PRIVATE)=...`
in bash output gets its value masked.

### A `sops` key is ignored

If your `.env.json` uses the key `sops` (for example, it's a sops-encrypted
file with a `sops` metadata section), that key is skipped so pi-heimdall
doesn't try to match literal metadata as a secret name.

## How the guards communicate with the LLM

When a guard blocks a tool call it returns a `reason` string that is delivered
back to the model as the tool result. Every reason includes an explicit
instruction such as:

> *Ask the user to run this command directly in their terminal if needed.
> Never attempt to bypass this protection or ask the user to disable it.*

This keeps the model from going into "creative workaround" mode and trying a
different command to accomplish the same leak.

If a pi TUI is attached, a warning notification is also shown so you can see
the block in real time.

## Layout

```
extensions/
├── heimdall-bg-tasks.ts # optional background-task entry point
└── heimdall.ts          # core guard entry point

lib/
├── background-tasks/
│   ├── extension.ts
│   └── shared.ts
├── guards/
│   ├── command-policy-guard.ts
│   ├── env-protect.ts
│   ├── kubectl-secret-guard.ts
│   ├── sandbox-guard.ts
│   ├── secret-guard.ts
│   └── sops-secret-guard.ts
├── sandbox/
│   ├── config.ts
│   ├── default-private-paths.ts
│   ├── filesystem-policy.ts
│   ├── runtime.ts
│   └── types.ts
├── heimdall-config.ts
├── preflight.ts
└── types.ts
```

The core guard extension and the optional background-task extension share config
loading plus sandbox/preflight helpers from `lib/`, but keep their runtime state separate.

## Development

```bash
npm install           # optional: only for editor tooling / type checks
npm run typecheck     # type-check the extensions
npm run check:pack    # verify the package tarball contents
```

GitHub Actions runs the same checks on pushes and pull requests to `main`.

Pi loads `.ts` files directly via [jiti](https://github.com/unjs/jiti), so no
build step is required at runtime.

## License

MIT © casualjim
