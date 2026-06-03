import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveGuidance, clearInjectionState, handleToolCallGuidance } from "../extensions/openspec/guidance.js";
import { createHarness } from "./helpers/pi-harness.js";

describe("guidance", () => {
	describe("resolveGuidance", () => {
		let projectDir: string;

		beforeEach(() => {
			projectDir = join(tmpdir(), `openspec-guidance-test-${Date.now()}`);
			mkdirSync(projectDir, { recursive: true });
		});

		afterEach(() => {
			rmSync(projectDir, { recursive: true, force: true });
		});

		it("resolves AGENTS.md in a subdirectory", () => {
			mkdirSync(join(projectDir, "src"), { recursive: true });
			writeFileSync(join(projectDir, "src", "AGENTS.md"), "# src guidance");
			const result = resolveGuidance(join(projectDir, "src", "Button.tsx"), projectDir);
			expect(result).toHaveLength(1);
			expect(result[0]!.kind).toBe("agents");
			expect(result[0]!.relativePath).toBe("src/AGENTS.md");
		});

		it("resolves CLAUDE.md when AGENTS.md is absent", () => {
			mkdirSync(join(projectDir, "src"), { recursive: true });
			writeFileSync(join(projectDir, "src", "CLAUDE.md"), "# src claude");
			const result = resolveGuidance(join(projectDir, "src", "widget.ts"), projectDir);
			expect(result).toHaveLength(1);
			expect(result[0]!.kind).toBe("claude");
			expect(result[0]!.relativePath).toBe("src/CLAUDE.md");
		});

		it("prefers AGENTS.md over CLAUDE.md at the same depth", () => {
			mkdirSync(join(projectDir, "src"), { recursive: true });
			writeFileSync(join(projectDir, "src", "AGENTS.md"), "# agents");
			writeFileSync(join(projectDir, "src", "CLAUDE.md"), "# claude");
			const result = resolveGuidance(join(projectDir, "src", "Button.tsx"), projectDir);
			expect(result).toHaveLength(1);
			expect(result[0]!.kind).toBe("agents");
		});

		it("skips AGENTS.md and CLAUDE.md at depth 0 (project root)", () => {
			writeFileSync(join(projectDir, "AGENTS.md"), "# root agents");
			writeFileSync(join(projectDir, "CLAUDE.md"), "# root claude");
			const result = resolveGuidance(join(projectDir, "README.md"), projectDir);
			expect(result).toHaveLength(0);
		});

		it("resolves guidance at multiple depths", () => {
			mkdirSync(join(projectDir, "src", "components"), { recursive: true });
			writeFileSync(join(projectDir, "src", "CLAUDE.md"), "# src guidance");
			writeFileSync(join(projectDir, "src", "components", "AGENTS.md"), "# components guidance");
			const result = resolveGuidance(join(projectDir, "src", "components", "Button.tsx"), projectDir);
			expect(result).toHaveLength(2);
			expect(result[0]!.relativePath).toBe("src/CLAUDE.md");
			expect(result[1]!.relativePath).toBe("src/components/AGENTS.md");
		});

		it("returns empty when no guidance files exist", () => {
			mkdirSync(join(projectDir, "src"), { recursive: true });
			const result = resolveGuidance(join(projectDir, "src", "deep", "file.ts"), projectDir);
			expect(result).toHaveLength(0);
		});

		it("returns empty for paths outside the project", () => {
			const result = resolveGuidance("/etc/passwd", projectDir);
			expect(result).toHaveLength(0);
		});
	});

	describe("handleToolCallGuidance", () => {
		let projectDir: string;

		beforeEach(() => {
			clearInjectionState();
			projectDir = join(tmpdir(), `openspec-guidance-toolcall-${Date.now()}`);
			mkdirSync(projectDir, { recursive: true });
		});

		afterEach(() => {
			rmSync(projectDir, { recursive: true, force: true });
		});

		it("injects guidance on read tool call", () => {
			const harness = createHarness();
			mkdirSync(join(projectDir, "src"), { recursive: true });
			writeFileSync(join(projectDir, "src", "AGENTS.md"), "# src guidance");

			handleToolCallGuidance(
				{ toolName: "read", input: { file_path: join(projectDir, "src", "Button.tsx") } },
				{ cwd: projectDir },
				harness.pi,
			);

			expect(harness.sentMessages).toHaveLength(1);
			expect(harness.sentMessages[0]!.customType).toBe("openspec-guidance");
		});

		it("injects guidance on edit and write tool calls", () => {
			const harness = createHarness();
			mkdirSync(join(projectDir, "src"), { recursive: true });
			writeFileSync(join(projectDir, "src", "AGENTS.md"), "# src guidance");

			for (const tool of ["edit", "write"]) {
				clearInjectionState();
				handleToolCallGuidance(
					{ toolName: tool, input: { file_path: join(projectDir, "src", "widget.ts") } },
					{ cwd: projectDir },
					harness.pi,
				);
			}

			expect(harness.sentMessages).toHaveLength(2);
		});

		it("skips non-read/edit/write tool calls", () => {
			const harness = createHarness();
			mkdirSync(join(projectDir, "src"), { recursive: true });
			writeFileSync(join(projectDir, "src", "AGENTS.md"), "# src guidance");

			handleToolCallGuidance(
				{ toolName: "bash", input: { command: "ls" } },
				{ cwd: projectDir },
				harness.pi,
			);

			expect(harness.sentMessages).toHaveLength(0);
		});

		it("does not re-inject already-injected guidance", () => {
			const harness = createHarness();
			mkdirSync(join(projectDir, "src"), { recursive: true });
			writeFileSync(join(projectDir, "src", "AGENTS.md"), "# src guidance");

			const event = { toolName: "read" as const, input: { file_path: join(projectDir, "src", "Button.tsx") } };
			handleToolCallGuidance(event, { cwd: projectDir }, harness.pi);
			handleToolCallGuidance(event, { cwd: projectDir }, harness.pi);

			expect(harness.sentMessages).toHaveLength(1);
		});
	});
});
