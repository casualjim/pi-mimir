import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import { tmpdir } from "node:os";
import { mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { spawn } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerSandboxGuard } from "../lib/guards/sandbox-guard";
import { buildSandboxPolicy, normalizeSandboxConfig } from "../lib/sandbox/config";
import {
	MISSING_BINARY_MESSAGE,
	createSandboxedBashOps,
	resolveHeimdallSandboxBinary,
} from "../lib/sandbox/runtime";

describe("sandbox-guard", () => {
	describe("normalizeSandboxConfig", () => {
		it("defaults to disabled without hidden private paths in policy", () => {
			const config = normalizeSandboxConfig();
			expect(config.enabled).toBe(false);
			expect(config.policy.filesystem?.deny).toBeUndefined();
		});

		it("keeps Pi-local settings outside the native policy", () => {
			const config = normalizeSandboxConfig({
				enabled: false,
				binaryPath: "/custom/heimdall-sandbox",
				useDefaultFilesystemDeny: false,
				network: "host",
				proc: "default",
				env: { deny: ["GITHUB_TOKEN"] },
				filesystem: { writable: ["."] },
				gpgAgent: true,
			});

			expect(config.enabled).toBe(false);
			expect(config.binaryPath).toBe("/custom/heimdall-sandbox");
			expect(config.policy).toMatchObject({
				network: "host",
				proc: "default",
				env: { deny: ["GITHUB_TOKEN"] },
				filesystem: { writable: ["."] },
				gpgAgent: true,
			});
			expect(config.policy).not.toHaveProperty("enabled");
			expect(config.policy).not.toHaveProperty("binaryPath");
			expect(config.policy).not.toHaveProperty("useDefaultFilesystemDeny");
		});

		it("drops legacy POC fields instead of translating or forwarding them", () => {
			const config = normalizeSandboxConfig({
				enabled: true,
				networkAccess: false,
				writableRoots: ["."],
				systemPaths: ["/usr"],
				etcReal: ["/etc/hosts"],
				etcSynthetic: { "/etc/passwd": "synthetic" },
				envAllowlist: ["PATH"],
				extraReadPaths: ["/opt"],
			});

			expect(config.enabled).toBe(true);
			expect(config.policy).not.toHaveProperty("network");
			expect(config.policy).not.toHaveProperty("proc");
			expect(config.policy).not.toHaveProperty("env");
			expect(config.policy.filesystem?.deny).toBeUndefined();
		});
	});

	describe("buildSandboxPolicy", () => {
		it("combines configured native fields with runtime bash execution fields", () => {
			const config = normalizeSandboxConfig({
				enabled: true,
				network: "host",
				proc: "default",
				env: { deny: ["GITHUB_TOKEN"] },
				filesystem: {
					deny: ["**/.env*", "!**/.env.example"],
					writable: ["."],
					virtual: { "/etc/hosts": "127.0.0.1 localhost\n" },
				},
				gpgAgent: true,
			});

			expect(buildSandboxPolicy(config, "/repo", "npm test")).toMatchObject({
				network: "host",
				proc: "default",
				env: { deny: ["GITHUB_TOKEN"] },
				filesystem: {
					deny: ["**/.env*", "!**/.env.example"],
					writable: ["."],
					virtual: { "/etc/hosts": "127.0.0.1 localhost\n" },
				},
				gpgAgent: true,
				cwd: "/repo",
				command: ["bash", "-c", "npm test"],
				stdio: "piped",
			});
		});

		it("omits Pi-local settings from generated policy even when sandboxing is active", () => {
			const policy = buildSandboxPolicy(
				normalizeSandboxConfig({ enabled: true, binaryPath: "/custom/heimdall-sandbox" }),
				"/repo",
				"echo ok",
			);
			expect(policy).not.toHaveProperty("enabled");
			expect(policy).not.toHaveProperty("binaryPath");
		});
	});

	describe("resolveHeimdallSandboxBinary", () => {
		it("uses an explicit config binary path", () => {
			expect(resolveHeimdallSandboxBinary("/custom/heimdall-sandbox")).toEqual({
				binaryPath: "/custom/heimdall-sandbox",
				found: true,
				source: "config",
			});
		});
	});

	describe("createSandboxedBashOps", () => {
		it("spawns heimdall-sandbox exec --policy - and writes policy JSON to stdin", async () => {
			const cwd = join(tmpdir(), `heimdall-sandbox-test-${Date.now()}`);
			mkdirSync(cwd, { recursive: true });

			const calls: Array<{
				command: string;
				args: string[];
				options: Record<string, unknown>;
				stdin: string;
			}> = [];

			const fakeSpawn = ((command: string, args: string[], options: Record<string, unknown>) => {
				const child = new EventEmitter() as EventEmitter & {
					pid: number;
					stdout: EventEmitter;
					stderr: EventEmitter;
					stdin: { end: (data: string) => void };
					kill: ReturnType<typeof vi.fn>;
				};
				const call = { command, args, options, stdin: "" };
				calls.push(call);
				child.pid = 12345;
				child.stdout = new EventEmitter();
				child.stderr = new EventEmitter();
				child.stdin = {
					end(data: string) {
						call.stdin = data;
						queueMicrotask(() => child.emit("close", 0));
					},
				};
				child.kill = vi.fn();
				return child;
			}) as unknown as typeof spawn;

			try {
				const config = normalizeSandboxConfig({
					enabled: true,
					network: "none",
					filesystem: { writable: ["."] },
				});
				const ops = createSandboxedBashOps(config, cwd, {
					binaryPath: "/bin/heimdall-sandbox",
					spawnFn: fakeSpawn,
				});

				await expect(ops.exec("echo hi", cwd, { onData: vi.fn() })).resolves.toEqual({ exitCode: 0 });

				expect(calls).toHaveLength(1);
				expect(calls[0]?.command).toBe("/bin/heimdall-sandbox");
				expect(calls[0]?.args).toEqual(["exec", "--policy", "-"]);
				expect(calls[0]?.options).toMatchObject({
					cwd,
					detached: true,
					stdio: ["pipe", "pipe", "pipe"],
				});
				expect(JSON.parse(calls[0]?.stdin ?? "{}")).toMatchObject({
					network: "none",
					filesystem: { writable: ["."] },
					cwd,
					command: ["bash", "-c", "echo hi"],
					stdio: "piped",
				});
			} finally {
				rmSync(cwd, { recursive: true, force: true });
			}
		});

		it("surfaces native launch failures clearly", async () => {
			const cwd = join(tmpdir(), `heimdall-sandbox-test-${Date.now()}`);
			mkdirSync(cwd, { recursive: true });

			const fakeSpawn = (() => {
				const child = new EventEmitter() as EventEmitter & {
					pid: number;
					stdout: EventEmitter;
					stderr: EventEmitter;
					stdin: { end: (data: string) => void };
					kill: ReturnType<typeof vi.fn>;
				};
				child.pid = 12345;
				child.stdout = new EventEmitter();
				child.stderr = new EventEmitter();
				child.stdin = { end: vi.fn() };
				child.kill = vi.fn();
				queueMicrotask(() => child.emit("error", new Error("ENOENT")));
				return child;
			}) as unknown as typeof spawn;

			try {
				const ops = createSandboxedBashOps(normalizeSandboxConfig({ enabled: true }), cwd, {
					binaryPath: "/missing/heimdall-sandbox",
					spawnFn: fakeSpawn,
				});

				await expect(ops.exec("echo hi", cwd, { onData: vi.fn() })).rejects.toThrow(
					'Failed to launch heimdall-sandbox at "/missing/heimdall-sandbox": ENOENT',
				);
			} finally {
				rmSync(cwd, { recursive: true, force: true });
			}
		});
	});

	describe("registerSandboxGuard", () => {
		it("does not activate sandbox operations when config is disabled", async () => {
			const harness = createPiHarness(false);
			registerSandboxGuard(harness.pi, () => ({ sandbox: { enabled: false } }));

			await harness.emitSessionStart();

			expect(harness.notify).not.toHaveBeenCalledWith("heimdall sandbox: active", "info");
			await expect(harness.userBash()).resolves.toBeUndefined();
		});

		it("honors --no-sandbox even when config enables sandboxing", async () => {
			const harness = createPiHarness(true);
			registerSandboxGuard(harness.pi, () => ({ sandbox: { enabled: true } }));

			await harness.emitSessionStart();

			expect(harness.notify).toHaveBeenCalledWith("heimdall sandbox: disabled via --no-sandbox", "warning");
			await expect(harness.userBash()).resolves.toBeUndefined();
		});

		it("warns with install guidance when binary is not found", async () => {
			const harness = createPiHarness(false);
			registerSandboxGuard(harness.pi, () => ({ sandbox: { enabled: true, binaryPath: "/nonexistent/heimdall-sandbox" } }));

			await harness.emitSessionStart();
			// Configured path is always "found" but will fail at exec time
			expect(harness.notify).toHaveBeenCalledWith("heimdall sandbox: active", "info");
		});
	});

	describe("config migration (paths/mode → filesystem)", () => {
		let tmpDir: string;

		beforeEach(() => {
			tmpDir = join(tmpdir(), `heimdall-migration-test-${Date.now()}`);
			mkdirSync(tmpDir, { recursive: true });
		});

		afterEach(() => {
			rmSync(tmpDir, { recursive: true, force: true });
		});

		it("migrates paths/mode to filesystem deny/writable", () => {
			const configPath = join(tmpDir, "heimdall.json");
			writeFileSync(configPath, JSON.stringify({
					sandbox: {
						enabled: true,
						paths: {
							"~/github": { mode: "write" },
							"~/.ssh": { mode: "deny" },
							"~/Private": { mode: "deny" },
						},
					},
				}, null, 2));

			const config = normalizeSandboxConfig(
				{ enabled: true, paths: { "~/github": { mode: "write" }, "~/.ssh": { mode: "deny" }, "~/Private": { mode: "deny" } } },
				configPath,
			);

			expect(config.policy.filesystem?.deny).toEqual(["~/.ssh", "~/Private"]);
			expect(config.policy.filesystem?.writable).toEqual(["~/github"]);

			// Config file was rewritten
			const rewritten = JSON.parse(readFileSync(configPath, "utf-8"));
			expect(rewritten.sandbox.filesystem).toEqual({
				deny: ["~/.ssh", "~/Private"],
				writable: ["~/github"],
			});
			expect(rewritten.sandbox.paths).toBeUndefined();
		});

		it("does not migrate when filesystem is already present", () => {
			const config = normalizeSandboxConfig({
				enabled: true,
				paths: { "~/old": { mode: "deny" } },
				filesystem: { deny: ["~/new"], writable: ["."] },
			});

			expect(config.policy.filesystem?.deny).toEqual(["~/new"]);
			expect(config.policy.filesystem?.writable).toEqual(["."]);
		});

		it("ignores read mode entries in migration", () => {
			const config = normalizeSandboxConfig({
				enabled: true,
				paths: {
					"~/github": { mode: "read" },
					"~/Private": { mode: "deny" },
				},
			});

			expect(config.policy.filesystem?.deny).toEqual(expect.arrayContaining(["~/Private"]));
			expect(config.policy.filesystem?.deny).not.toContain("~/github");
			expect(config.policy.filesystem?.writable).toBeUndefined();
		});
	});

	describe("host tool enforcement (tool_call)", () => {
		it("blocks read of denied paths", async () => {
			const harness = createPiHarness(false);
			registerSandboxGuard(harness.pi, () => ({
				sandbox: { enabled: true, filesystem: { deny: ["~/Private"] } },
			}));
			await harness.emitSessionStart();

			const result = await harness.emitToolCall("read", { path: "~/Private/secret.txt" });
			expect(result).toEqual({ block: true, reason: expect.stringContaining("denied") });
		});

		it("does not block private paths without explicit config or fragments", async () => {
			const harness = createPiHarness(false);
			registerSandboxGuard(harness.pi, () => ({
				sandbox: { enabled: true },
			}));
			await harness.emitSessionStart();

			const result = await harness.emitToolCall("read", { path: "~/.ssh/id_rsa" });
			expect(result).toBeUndefined();
		});

		it("allows read of non-denied paths", async () => {
			const harness = createPiHarness(false);
			registerSandboxGuard(harness.pi, () => ({
				sandbox: { enabled: true, filesystem: { writable: ["."] } },
			}));
			await harness.emitSessionStart();

			const result = await harness.emitToolCall("read", { path: "./src/index.ts" });
			expect(result).toBeUndefined();
		});

		it("blocks write when no writable policy is set (read-only default)", async () => {
			const harness = createPiHarness(false);
			registerSandboxGuard(harness.pi, () => ({
				sandbox: { enabled: true },
			}));
			await harness.emitSessionStart();

			const result = await harness.emitToolCall("write", { path: "./src/index.ts" });
			expect(result).toEqual({ block: true, reason: expect.stringContaining("denied") });
		});

		it("allows write to writable paths", async () => {
			const harness = createPiHarness(false);
			registerSandboxGuard(harness.pi, () => ({
				sandbox: { enabled: true, filesystem: { writable: ["."] } },
			}));
			await harness.emitSessionStart();

			const result = await harness.emitToolCall("write", { path: "./src/index.ts" });
			expect(result).toBeUndefined();
		});

		it("blocks write to non-writable paths", async () => {
			const harness = createPiHarness(false);
			registerSandboxGuard(harness.pi, () => ({
				sandbox: { enabled: true, filesystem: { writable: ["./src"] } },
			}));
			await harness.emitSessionStart();

			const result = await harness.emitToolCall("write", { path: "./README.md" });
			expect(result).toEqual({ block: true, reason: expect.stringContaining("denied") });
		});

		it("blocks edit of non-writable paths", async () => {
			const harness = createPiHarness(false);
			registerSandboxGuard(harness.pi, () => ({
				sandbox: { enabled: true, filesystem: { writable: ["./src"] } },
			}));
			await harness.emitSessionStart();

			const result = await harness.emitToolCall("edit", { path: "./README.md" });
			expect(result).toEqual({ block: true, reason: expect.stringContaining("denied") });
		});

		it("allows edit to writable paths", async () => {
			const harness = createPiHarness(false);
			registerSandboxGuard(harness.pi, () => ({
				sandbox: { enabled: true, filesystem: { writable: ["."] } },
			}));
			await harness.emitSessionStart();

			const result = await harness.emitToolCall("edit", { path: "./src/index.ts" });
			expect(result).toBeUndefined();
		});

		it("deny takes precedence over writable", async () => {
			const harness = createPiHarness(false);
			registerSandboxGuard(harness.pi, () => ({
				sandbox: { enabled: true, filesystem: { writable: ["."], deny: ["./secrets"] } },
			}));
			await harness.emitSessionStart();

			const result = await harness.emitToolCall("write", { path: "./secrets/key.pem" });
			expect(result).toEqual({ block: true, reason: expect.stringContaining("denied") });
		});

		it("does not block when sandbox is disabled", async () => {
			const harness = createPiHarness(false);
			registerSandboxGuard(harness.pi, () => ({
				sandbox: { enabled: false },
			}));
			await harness.emitSessionStart();

			const result = await harness.emitToolCall("write", { path: "./anywhere" });
			expect(result).toBeUndefined();
		});

		it("blocks gitignore glob patterns", async () => {
			const harness = createPiHarness(false);
			registerSandboxGuard(harness.pi, () => ({
				sandbox: { enabled: true, filesystem: { deny: ["**/.env*"] } },
			}));
			await harness.emitSessionStart();

			const result = await harness.emitToolCall("read", { path: "./.env.production" });
			expect(result).toEqual({ block: true, reason: expect.stringContaining("denied") });
		});

		it("supports gitignore negation patterns", async () => {
			const harness = createPiHarness(false);
			registerSandboxGuard(harness.pi, () => ({
				sandbox: { enabled: true, filesystem: { deny: ["**/.env*", "!**/.env.example"] } },
			}));
			await harness.emitSessionStart();

			const blocked = await harness.emitToolCall("read", { path: "./.env.production" });
			expect(blocked).toEqual({ block: true, reason: expect.stringContaining("denied") });

			const allowed = await harness.emitToolCall("read", { path: "./.env.example" });
			expect(allowed).toBeUndefined();
		});
	});

	describe("fragment files (.heimdall-deny / .heimdall-write)", () => {
		let tmpDir: string;

		beforeEach(() => {
			tmpDir = join(tmpdir(), `heimdall-fragment-test-${Date.now()}`);
			mkdirSync(tmpDir, { recursive: true });
		});

		afterEach(() => {
			rmSync(tmpDir, { recursive: true, force: true });
		});

		it("reads .heimdall-deny from cwd and denies matching paths", async () => {
			writeFileSync(join(tmpDir, ".heimdall-deny"), "secret.txt\nanother-secret/**\n");
			const harness = createPiHarness(false, tmpDir);
			registerSandboxGuard(harness.pi, () => ({
				sandbox: { enabled: true, filesystem: { writable: ["."] } },
			}));
			await harness.emitSessionStart();

			const result = await harness.emitToolCall("read", { path: join(tmpDir, "secret.txt") });
			expect(result).toEqual({ block: true, reason: expect.stringContaining("denied") });
		});

		it("reads .heimdall-write from cwd and grants write access", async () => {
			writeFileSync(join(tmpDir, ".heimdall-write"), "src/**\n");
			const harness = createPiHarness(false, tmpDir);
			registerSandboxGuard(harness.pi, () => ({
				sandbox: { enabled: true },
			}));
			await harness.emitSessionStart();

			const allowed = await harness.emitToolCall("write", { path: join(tmpDir, "src/index.ts") });
			expect(allowed).toBeUndefined();

			const blocked = await harness.emitToolCall("write", { path: join(tmpDir, "README.md") });
			expect(blocked).toEqual({ block: true, reason: expect.stringContaining("denied") });
		});

		it("ignores comments and blank lines in fragment files", async () => {
			writeFileSync(join(tmpDir, ".heimdall-deny"), "# comment\n\nsecret.txt\n");
			const harness = createPiHarness(false, tmpDir);
			registerSandboxGuard(harness.pi, () => ({
				sandbox: { enabled: true, filesystem: { writable: ["."] } },
			}));
			await harness.emitSessionStart();

			const result = await harness.emitToolCall("read", { path: join(tmpDir, "secret.txt") });
			expect(result).toEqual({ block: true, reason: expect.stringContaining("denied") });
		});

		it("picks up changes to fragment files between tool calls", async () => {
			const harness = createPiHarness(false, tmpDir);
			registerSandboxGuard(harness.pi, () => ({
				sandbox: { enabled: true, filesystem: { writable: ["."] } },
			}));
			await harness.emitSessionStart();

			// Not denied yet
			const before = await harness.emitToolCall("read", { path: join(tmpDir, "newly-denied.txt") });
			expect(before).toBeUndefined();

			// Add a fragment deny
			writeFileSync(join(tmpDir, ".heimdall-deny"), "newly-denied.txt\n");

			// Now denied
			const after = await harness.emitToolCall("read", { path: join(tmpDir, "newly-denied.txt") });
			expect(after).toEqual({ block: true, reason: expect.stringContaining("denied") });
		});
	});
});

function createPiHarness(noSandboxFlag: boolean, cwd?: string) {
	const handlers = new Map<string, Array<(...args: unknown[]) => unknown>>();
	const notify = vi.fn();
	const setStatus = vi.fn();
	const setWidget = vi.fn();
	const registerTool = vi.fn();
	const registerFlag = vi.fn();
	const registerCommand = vi.fn();
	const pi = {
		registerFlag,
		registerTool,
		registerCommand,
		getFlag: vi.fn(() => noSandboxFlag),
		on: vi.fn((name: string, handler: (...args: unknown[]) => unknown) => {
			handlers.set(name, [...(handlers.get(name) ?? []), handler]);
		}),
	} as unknown as ExtensionAPI;

	return {
		pi,
		notify,
		setStatus,
		setWidget,
		registerTool,
		registerFlag,
		registerCommand,
		async emitSessionStart() {
			const sessionHandlers = handlers.get("session_start") ?? [];
			for (const handler of sessionHandlers) {
				await handler({}, {
					cwd: cwd ?? process.cwd(),
					ui: {
						notify,
						setStatus,
						setWidget,
						theme: { fg: (_color: string, value: string) => value },
					},
				});
			}
		},
		userBash() {
			const userBashHandlers = handlers.get("user_bash") ?? [];
			return userBashHandlers.at(-1)?.();
		},
		async emitToolCall(toolName: string, input: Record<string, unknown>) {
			const toolCallHandlers = handlers.get("tool_call") ?? [];
			for (const handler of toolCallHandlers) {
				const result = await handler(
					{ toolName, input, type: toolName },
					{ hasUI: true, ui: { notify } },
				);
				if (result) return result;
			}
			return undefined;
		},
	};
}
