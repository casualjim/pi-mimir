#!/usr/bin/env bun
/**
 * Surface acceptance check: installs this package into isolated omp and pi
 * environments and asserts each host really discovers the package surfaces.
 * No model calls; safe to run offline. Modeled on pi-caveman's
 * tests/integration/run-e2e.ts. This is a manual gate (it needs the host
 * CLIs), not part of `pnpm test`:
 *
 *   bun tests/integration/run-surface-e2e.ts
 *
 * Environment overrides: E2E_PACKAGE_SOURCE, E2E_OMP_BIN, E2E_PI_BIN.
 *
 * Agent discovery has no CLI listing surface on either host; it is covered
 * structurally by tests/agents-contract.ts (role-pack registration plus
 * frontmatter both hosts parse).
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const PACKAGE_SOURCE = process.env.E2E_PACKAGE_SOURCE ?? resolve(scriptDir, "../..");
const OMP_BIN = process.env.E2E_OMP_BIN ?? "omp";
const PI_BIN = process.env.E2E_PI_BIN ?? resolve(PACKAGE_SOURCE, "node_modules/.bin/pi");

const ROOT = mkdtempSync(join(tmpdir(), "pi-addy-skills-e2e-"));

type RunOptions = { cwd?: string; env?: Record<string, string> };

function fail(message: string, details = ""): never {
  console.error(`\n[E2E] FAIL: ${message}\n${details}`);
  rmSync(ROOT, { recursive: true, force: true });
  process.exit(1);
}

function run(name: string, command: string, args: string[], options: RunOptions = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    env: { ...process.env, ...options.env },
    encoding: "utf8",
    timeout: 120_000,
  });
  if (result.error) fail(`${name}: could not spawn ${command}`, String(result.error));
  return { status: result.status, combined: `${result.stdout ?? ""}\n${result.stderr ?? ""}` };
}

function assertIncludes(text: string, expected: string, phase: string): void {
  if (!text.includes(expected))
    fail(`${phase}: expected output to include ${JSON.stringify(expected)}`, text);
}

// --- omp: isolated HOME, plugin link, manifest and skill discovery ---
const OMP_HOME = join(ROOT, "omp-home");
mkdirSync(OMP_HOME, { recursive: true });
const ompEnv = { HOME: OMP_HOME };

const linked = run("omp plugin link", OMP_BIN, ["plugin", "link", PACKAGE_SOURCE], { env: ompEnv });
if (linked.status !== 0) fail("omp plugin link", linked.combined);
assertIncludes(linked.combined, "@casualjim/pi-addy-skills", "omp plugin link");

const list = run("omp plugin list", OMP_BIN, ["plugin", "list", "--json"], { env: ompEnv });
if (list.status !== 0) fail("omp plugin list", list.combined);
const manifest = JSON.parse(list.combined.slice(list.combined.indexOf("{"))) as {
  npm: Array<{ name: string; manifest: Record<string, string[] | undefined> }>;
};
const entry = manifest.npm.find((p) => p.name === "@casualjim/pi-addy-skills");
if (!entry) fail("omp plugin list missing package", list.combined);
for (const [key, value] of [
  ["extensions", "./extensions/addy-skills"],
  ["skills", "./skills"],
  ["prompts", "./commands"],
] as const) {
  if (!entry.manifest[key]?.includes(value))
    fail(`omp manifest missing ${key} entry ${value}`, JSON.stringify(entry.manifest));
}

const skills = run("omp skills list", OMP_BIN, ["skills", "list"], { env: ompEnv });
if (skills.status !== 0) fail("omp skills list", skills.combined);
for (const skill of [
  "test-driven-development",
  "doubt-driven-development",
  "browser-testing-with-devtools",
  "using-agent-skills",
])
  assertIncludes(skills.combined, skill, "omp skills list");
console.error("[E2E] omp surfaces ok (link, manifest extensions/skills/prompts, commands on disk, skill discovery)");

// --- pi: isolated HOME + agent dir, local install, trusted listing ---
const PI_HOME = join(ROOT, "pi-home");
const PI_PROJECT = join(ROOT, "pi-project");
mkdirSync(join(PI_HOME, ".pi", "agent"), { recursive: true });
mkdirSync(PI_PROJECT, { recursive: true });
writeFileSync(join(PI_PROJECT, "package.json"), JSON.stringify({ type: "module" }, null, 2));
const piEnv = {
  HOME: PI_HOME,
  PI_CODING_AGENT_DIR: join(PI_HOME, ".pi", "agent"),
  PI_OFFLINE: "1",
};

const installed = run("pi install", PI_BIN, ["install", "-l", PACKAGE_SOURCE], {
  cwd: PI_PROJECT,
  env: piEnv,
});
if (installed.status !== 0) fail("pi install -l", installed.combined);

const piList = run("pi list", PI_BIN, ["list", "--approve"], { cwd: PI_PROJECT, env: piEnv });
if (piList.status !== 0) fail("pi list --approve", piList.combined);
assertIncludes(piList.combined, "pi-addy-skills", "pi list");
assertIncludes(piList.combined, PACKAGE_SOURCE, "pi list resolved path");
console.error("[E2E] pi surfaces ok (local install, trusted project listing)");

rmSync(ROOT, { recursive: true, force: true });
console.error("\n[E2E] pi-addy-skills surface acceptance passed");
