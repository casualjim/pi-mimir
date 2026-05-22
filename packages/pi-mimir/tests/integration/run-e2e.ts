#!/usr/bin/env node
/**
 * E2E integration test for pi-mimir.
 *
 * Runs against a real `pi` CLI instance with this package installed into an
 * isolated HOME/PI_CODING_AGENT_DIR and prompts the model to exercise the
 * package-owned workflow surface.
 *
 * Usage:
 *   cd packages/pi-mimir
 *   npm run test:e2e
 *
 * Optional env:
 *   E2E_MODEL=zai/glm-5-turbo
 *   E2E_PACKAGE_SOURCE=/absolute/path/to/packages/pi-mimir
 */

import { cpSync, existsSync, mkdtempSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_SOURCE = process.env.E2E_PACKAGE_SOURCE ?? resolve(__dirname, "../..");
const MODEL = process.env.E2E_MODEL ?? "zai/glm-5-turbo";
const ROOT = mkdtempSync(`${tmpdir()}/pi-mimir-e2e-`);
const PROJECT = `${ROOT}/project`;
const HOME = `${ROOT}/home`;
const AGENT_DIR = `${HOME}/.pi/agent`;
const SESSION_DIR = `${ROOT}/sessions`;

type RunOptions = {
	cwd?: string;
	timeout?: number;
	allowFailure?: boolean;
};

function fail(message: string, details = ""): never {
	console.error(`\n[E2E FAIL] ${message}`);
	if (details) console.error(details);
	process.exit(1);
}

function run(name: string, command: string, args: string[], options: RunOptions = {}) {
	console.error(`\n[E2E] ${name}`);
	console.error([command, ...args].join(" "));
	const result = spawnSync(command, args, {
		cwd: options.cwd ?? PROJECT,
		env: {
			...process.env,
			HOME,
			PI_CODING_AGENT_DIR: AGENT_DIR,
			PI_OFFLINE: "1",
			PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
		},
		encoding: "utf8",
		timeout: options.timeout ?? 180_000,
		maxBuffer: 20 * 1024 * 1024,
	});
	const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
	if (result.status !== 0 && !options.allowFailure) {
		fail(`${name} exited ${result.status}`, `signal=${result.signal ?? "none"}\nerror=${result.error?.message ?? "none"}\n${combined}`);
	}
	return { ...result, combined };
}

function assertIncludes(text: string, expected: string, phase: string): void {
	if (!text.includes(expected)) {
		fail(`${phase}: missing expected text`, `Expected: ${expected}\n\nOutput:\n${text}`);
	}
}

function assertNotIncludes(text: string, unexpected: string, phase: string): void {
	if (text.includes(unexpected)) {
		fail(`${phase}: found unexpected text`, `Unexpected: ${unexpected}\n\nOutput:\n${text}`);
	}
}

function piPrompt(name: string, prompt: string, options: RunOptions = {}) {
	return run(
		name,
		"pi",
		["--offline", "--openspec-debug", "--no-tools", "--model", MODEL, "--session-dir", SESSION_DIR, "-p", prompt],
		{ timeout: 300_000, ...options },
	).combined;
}

mkdirSync(PROJECT, { recursive: true });
mkdirSync(AGENT_DIR, { recursive: true });
mkdirSync(SESSION_DIR, { recursive: true });
writeFileSync(`${PROJECT}/package.json`, JSON.stringify({ type: "module" }, null, 2));
mkdirSync(`${PROJECT}/openspec/changes/sample-change/specs/sample-capability`, { recursive: true });
writeFileSync(`${PROJECT}/openspec/changes/sample-change/proposal.md`, "## Why\nE2E sample.\n\n## What Changes\n- Add sample behavior.\n");
writeFileSync(`${PROJECT}/openspec/changes/sample-change/specs/sample-capability/spec.md`, "## ADDED Requirements\n\n### Requirement: Sample behavior\nThe system SHALL expose sample behavior.\n\n#### Scenario: Sample\n- **WHEN** sample runs\n- **THEN** sample passes\n");
writeFileSync(`${PROJECT}/openspec/changes/sample-change/design.md`, "## Context\nE2E.\n\n## Decisions\nUse existing workflow.\n");
writeFileSync(`${PROJECT}/openspec/changes/sample-change/tasks.md`, "## 1. Sample\n\n- [x] 1.1 Sample task complete\n");

run("install pi-mimir", "pi", ["install", "-l", PACKAGE_SOURCE], { cwd: PROJECT });
const list = run("list installed packages", "pi", ["list"], { cwd: PROJECT }).combined;
assertIncludes(list, "pi-mimir", "install/list");

const guidancePrompt = [
	"Report the OpenSpec workflow guidance from your system prompt.",
	"Return only a compact bullet list of package-owned workflow entrypoints and forbidden git actions.",
	"Do not invent commands.",
].join(" ");
const guidance = piPrompt("workflow guidance injection", guidancePrompt);
assertIncludes(guidance, "plan", "workflow guidance");
assertIncludes(guidance, "implement", "workflow guidance");
assertIncludes(guidance, "review-implementation", "workflow guidance");
assertIncludes(guidance.toLowerCase(), "commit", "workflow guidance");
assertIncludes(guidance.toLowerCase(), "push", "workflow guidance");

const skillSeedDir = `${PACKAGE_SOURCE}/skillseeds`;
const projectSkillsDir = `${PROJECT}/.pi/skills`;
mkdirSync(projectSkillsDir, { recursive: true });
for (const name of readdirSync(skillSeedDir)) {
	const source = `${skillSeedDir}/${name}`;
	if (existsSync(`${source}/SKILL.md`)) cpSync(source, `${projectSkillsDir}/${name}`, { recursive: true, force: true });
}
assertIncludes(readdirSync(projectSkillsDir).join(","), "review-implementation", "skill sync");
assertIncludes(readdirSync(projectSkillsDir).join(","), "review-proposal", "skill sync");
assertIncludes(readdirSync(projectSkillsDir).join(","), "review-tasks", "skill sync");

const reviewImplementation = piPrompt(
	"review-implementation skill invocation",
	"/skill:review-implementation sample-change\nSummarize the exact lower-level review skills this workflow invokes. Do not run tools.",
);
assertIncludes(reviewImplementation, "review-architecture", "review-implementation");
assertIncludes(reviewImplementation, "review-tests", "review-implementation");
assertIncludes(reviewImplementation, "review-performance", "review-implementation");
assertIncludes(reviewImplementation, "review-security", "review-implementation");
assertNotIncludes(reviewImplementation, "git commit", "review-implementation");

console.error("\n[E2E] pi-mimir real Pi workflow test passed");
