## 1. Package Scaffold

- [x] 1.1 Create `packages/pi-caveman` directory with `package.json`, `README.md`, `tsconfig.json`, and `vitest.config.ts` following existing monorepo package conventions.
- [x] 1.2 Configure `package.json` with `pi-package` keyword, `pi.skills: ["skills"]`, package files, test/typecheck scripts, and package metadata.
- [x] 1.3 Add upstream Caveman license/attribution material to the package documentation or license files.

## 2. Skill Port

- [x] 2.1 Copy and adapt the `caveman` skill for Pi, preserving intensity levels, persistence rules, auto-clarity behavior, and deactivation wording.
- [x] 2.2 Copy and adapt the `caveman-commit` skill for Pi, preserving Conventional Commit constraints and the boundary that it does not run git commands.
- [x] 2.3 Copy and adapt the `caveman-review` skill for Pi, preserving terse review format and the boundary that it does not apply fixes.
- [x] 2.4 Copy and adapt the `caveman-help` skill for Pi, updating command/trigger references to match Pi skill usage.
- [x] 2.5 Copy and adapt the `caveman-compress` skill for Pi, preserving safety rules and resolving any referenced helper resources.
- [x] 2.6 Port `caveman-stats` into an honest Pi-compatible skill that either uses a Pi-native stats source or clearly explains the upstream hook limitation.
- [x] 2.7 Port `cavecrew` guidance for Pi subagent usage and bundle or adapt cavecrew prompt resources where practical.

## 3. Resource and Compatibility Review

- [x] 3.1 Inspect upstream `commands/`, `agents/`, `src/hooks/`, and plugin manifest files for useful content to adapt without activating non-Pi installer behavior.
- [x] 3.2 Ensure no packaged install script mutates non-Pi agent configs or invokes upstream shell/Node installers during Pi package installation.
- [x] 3.3 Verify every skill frontmatter block has a valid unique skill name and a Pi-appropriate description.
- [x] 3.4 Update package README with install instructions, included skills, known limitations, and upstream attribution.

## 4. Tests and Validation

- [x] 4.1 Add tests that validate the package manifest exposes `pi.skills` and expected package metadata.
- [x] 4.2 Add tests that verify required skill files exist for the full Caveman skill surface.
- [x] 4.3 Add tests that parse skill frontmatter names/descriptions and reject duplicates or missing descriptions.
- [x] 4.4 Run `npm test --workspace packages/pi-caveman` or the repository's equivalent package test command.
- [x] 4.5 Run package typecheck or document why the package has no TypeScript compile surface.
- [x] 4.6 Add Pi CLI e2e integration test for package install and skill invocation.
- [x] 4.7 Add and run package e2e script.
- [x] 4.8 Update mise integration task and Pi e2e invocation.

## 5. Final Review

- [x] 5.1 Compare the implemented package against `openspec/changes/port-caveman-package/specs/pi-caveman-package/spec.md` and close any requirement gaps.
- [x] 5.2 Confirm `packages/pi-caveman` contains no active non-Pi plugin installer behavior.
- [x] 5.3 Record any intentionally deferred Caveman parity gaps in the README.
