## 1. Package scaffolding and imports

- [x] 1.1 Populate `packages/advisor/` with the imported/adapted source files needed for package entrypoints, advisor runtime logic, UI helpers, prompts, and package metadata.
- [x] 1.2 Add or update package dependencies, Pi package registration, and any managed-agent manifest helpers required for the advisor package.
- [x] 1.3 Add a bundled advisor child agent definition and package-owned syncing path for delivering it into `.pi/agents/`.

## 2. Advisor configuration behavior

- [x] 2.1 Implement advisor model selection, effort selection, persistence, and restore-on-session-start behavior.
- [x] 2.2 Implement off-by-default activation, explicit disable behavior, and per-executor blocklist handling.
- [x] 2.3 Add clear advisor error reporting for missing configuration, unavailable models, and missing fork/subagent prerequisites.

## 3. Forked consultation engine

- [x] 3.1 Replace the in-process consultation path with a forked child advisor execution path that uses the configured advisor model.
- [x] 3.2 Enforce the advisor child contract so consultations return concise plan/correction/stop guidance only.
- [x] 3.3 Prevent recursion by ensuring advisor child sessions cannot invoke the advisor tool again and keep the child lane read-only.

## 4. Verification and package polish

- [x] 4.1 Add or adapt tests for package registration, configuration persistence, activation/blocklist behavior, bundled-agent syncing, successful forked consultation, recursion guard, and failure envelopes.
- [x] 4.2 Update workspace/package documentation to explain advisor setup, forked-session behavior, prerequisites, and limitations.
- [x] 4.3 Run the relevant package test and typecheck commands and fix any issues needed for the advisor package to be implementation-ready.
