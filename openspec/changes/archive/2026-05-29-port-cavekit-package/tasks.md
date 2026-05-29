## 1. Package Scaffold

- [x] 1.1 Create `packages/pi-cavekit` directory with `package.json`, `README.md`, `tsconfig.json`, and `vitest.config.ts` following existing monorepo package conventions.
- [x] 1.2 Configure `package.json` with `pi-package` keyword, `pi.skills: ["skills"]`, `pi.prompts: ["prompts"]`, no `pi.extensions`, package files, test/typecheck scripts, and package metadata.
- [x] 1.3 Add upstream Cavekit license and attribution material to package files and documentation.
- [x] 1.4 Copy upstream `FORMAT.md` into the package as the bundled `SPEC.md` format reference.

## 2. Skill Port

- [x] 2.1 Create `skills/cavekit-spec/SKILL.md` by adapting upstream `skills/spec/SKILL.md` for Pi, namespaced frontmatter, bundled `FORMAT.md` reference, and Pi-safe write/approval rules.
- [x] 2.2 Create `skills/cavekit-build/SKILL.md` by adapting upstream `skills/build/SKILL.md` for Pi, preserving task selection and verification behavior while removing automatic commit requirements unless explicitly requested by the user.
- [x] 2.3 Create `skills/cavekit-check/SKILL.md` by adapting upstream `skills/check/SKILL.md` for Pi as a read-only drift report workflow.
- [x] 2.4 Create `skills/cavekit-backprop/SKILL.md` by adapting upstream `skills/backprop/SKILL.md` for Pi and ensuring it references `cavekit-spec` rather than generic `spec` where appropriate.
- [x] 2.5 Verify every Cavekit skill frontmatter block has a valid unique `cavekit-*` name and a Pi-appropriate description.

## 3. Prompt Template Port

- [x] 3.1 Create `prompts/ck:spec.md` by adapting upstream `commands/spec.md` and wiring it to the `cavekit-spec` workflow.
- [x] 3.2 Create `prompts/ck:build.md` by adapting upstream `commands/build.md` and wiring it to the `cavekit-build` workflow.
- [x] 3.3 Create `prompts/ck:check.md` by adapting upstream `commands/check.md` and wiring it to the `cavekit-check` workflow.
- [x] 3.4 Verify prompt frontmatter includes descriptions and argument hints and that colon filenames are preserved in the package.

## 4. Resource and Compatibility Review

- [x] 4.1 Inspect upstream Cavekit `commands/`, `skills/`, `FORMAT.md`, README, plugin metadata, and license for source material to adapt.
- [x] 4.2 Ensure upstream Cavekit `skills/caveman` is not included in `packages/pi-cavekit`.
- [x] 4.3 Ensure no active upstream shell installers, hooks, plugin manifests, managed config, or non-Pi agent setup files are packaged.
- [x] 4.4 Update package README with install instructions, included commands/skills, `SPEC.md`/`FORMAT.md` relationship, known non-goals, and upstream attribution.

## 5. Tests and Validation

- [x] 5.1 Add tests that validate the package manifest exposes expected `pi.skills` and `pi.prompts` and does not expose `pi.extensions`.
- [x] 5.2 Add tests that verify required skill files, prompt files, `FORMAT.md`, README, and license/attribution files exist.
- [x] 5.3 Add tests that parse skill frontmatter names/descriptions and reject duplicates or invalid names.
- [x] 5.4 Add tests that verify excluded resources stay excluded, including `skills/caveman` and active non-Pi installer/plugin resources.
- [x] 5.5 Run `npm test --workspace packages/pi-cavekit` or the repository's equivalent package test command.
- [x] 5.6 Run package typecheck or document why the package has no TypeScript compile surface.

## 6. Final Review

- [x] 6.1 Compare the implemented package against `openspec/changes/port-cavekit-package/specs/pi-cavekit-package/spec.md` and close any requirement gaps.
- [x] 6.2 Confirm `packages/pi-cavekit` contains no extension, managed config sync, or active non-Pi plugin installer behavior.
- [x] 6.3 Confirm `packages/pi-cavekit` has no runtime dependency on `packages/pi-caveman` and documents `pi-caveman` as complementary only.
