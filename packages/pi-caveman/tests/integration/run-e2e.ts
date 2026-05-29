#!/usr/bin/env node
/**
 * E2E integration test for pi-caveman.
 *
 * Runs against a real `pi` CLI instance with this package installed into an
 * isolated HOME/PI_CODING_AGENT_DIR and prompts the model to exercise the
 * package-owned skill surface.
 *
 * Usage:
 *   cd packages/pi-caveman
 *   npm run test:e2e
 *
 * Optional env:
 *   E2E_MODEL=zai/glm-5-turbo
 *   E2E_PACKAGE_SOURCE=/absolute/path/to/packages/pi-caveman
 */

import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_SOURCE = process.env.E2E_PACKAGE_SOURCE ?? resolve(__dirname, "../..");
const MODEL = process.env.E2E_MODEL ?? "zai/glm-5-turbo";
const ROOT = mkdtempSync(`${tmpdir()}/pi-caveman-e2e-`);
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

function piPrompt(name: string, prompt: string, options: RunOptions = {}) {
	return run(
		name,
		"pi",
		["--offline", "--model", MODEL, "--session-dir", SESSION_DIR, "-p", prompt],
		{ timeout: 300_000, ...options },
	).combined;
}

mkdirSync(PROJECT, { recursive: true });
mkdirSync(AGENT_DIR, { recursive: true });
mkdirSync(SESSION_DIR, { recursive: true });
writeFileSync(`${PROJECT}/package.json`, JSON.stringify({ type: "module" }, null, 2));

run("install pi-caveman", "pi", ["install", "-l", PACKAGE_SOURCE], { cwd: PROJECT });
const list = run("list installed packages", "pi", ["list"], { cwd: PROJECT }).combined;
assertIncludes(list, "pi-caveman", "install/list");

const help = piPrompt(
	"caveman-help skill invocation",
	[
		"/skill:caveman-help",
		"Return only the exact Caveman skill names from the help card, one per line.",
		"Do not add explanations.",
	].join("\n"),
);
for (const skill of [
	"caveman",
	"caveman-commit",
	"caveman-review",
	"caveman-help",
	"caveman-compress",
	"caveman-stats",
	"cavecrew",
]) {
	assertIncludes(help, skill, "caveman-help");
}

const stats = piPrompt(
	"caveman-stats skill invocation",
	[
		"/skill:caveman-stats",
		"Return the documented response pattern only. Do not estimate any token savings.",
	].join("\n"),
);
assertIncludes(stats.toLowerCase(), "unavailable", "caveman-stats");
assertIncludes(stats.toLowerCase(), "no fake", "caveman-stats");

const cavecrew = piPrompt(
	"cavecrew skill invocation",
	[
		"/skill:cavecrew",
		"Return only the Pi Subagent Rule from the skill. Do not execute tools.",
	].join("\n"),
);
assertIncludes(cavecrew.toLowerCase(), "list", "cavecrew");
assertIncludes(cavecrew.toLowerCase(), "subagent", "cavecrew");

const commit = piPrompt(
	"caveman-commit skill invocation",
	[
		"/skill:caveman-commit",
		"Generate a commit message for: add Pi Caveman package integration tests.",
		"Return only the commit message in a fenced code block. Do not run git.",
	].join("\n"),
);
assertIncludes(commit, "```", "caveman-commit");
assertIncludes(commit.toLowerCase(), "test", "caveman-commit");

console.error("\n[E2E] pi-caveman real Pi skill test passed");
