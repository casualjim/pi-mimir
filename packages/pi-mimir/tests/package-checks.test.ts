import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
	CODEBASE_MEMORY_INSTALL_COMMAND,
	CODEBASE_MEMORY_PLUGIN_PACKAGE,
	EXPECTED_CODEBASE_MEMORY_TOOLS,
	findWorkflowOverlaps,
	getCodebaseMemorySupportStatus,
	hasPiCodebaseMemoryInstalled,
} from "../extensions/openspec/package-checks.js";

describe("package-checks", () => {
	describe("codebase-memory constants", () => {
		it("points users at the standalone plugin and expected tools", () => {
			expect(CODEBASE_MEMORY_PLUGIN_PACKAGE).toBe("@casualjim/pi-codebase-memory");
			expect(CODEBASE_MEMORY_INSTALL_COMMAND).toBe("pi install @casualjim/pi-codebase-memory");
			expect(EXPECTED_CODEBASE_MEMORY_TOOLS).toContain("codebase_memory_search_graph");
			expect(EXPECTED_CODEBASE_MEMORY_TOOLS).toContain("codebase_memory_get_code_snippet");
		});
	});

	describe("workflow overlap detection", () => {
		let cwd: string;

		beforeEach(() => {
			cwd = join(tmpdir(), `openspec-overlap-test-${Date.now()}`);
			mkdirSync(join(cwd, ".pi", "skills", "blueprint"), { recursive: true });
			writeFileSync(join(cwd, ".pi", "skills", "blueprint", "SKILL.md"), "# blueprint");
		});

		afterEach(() => {
			rmSync(cwd, { recursive: true, force: true });
		});

		it("does not treat workflow skill names as overlaps", () => {
			expect(findWorkflowOverlaps(cwd)).not.toContain("skill:blueprint");
			mkdirSync(join(cwd, ".pi", "skills", "plan"), { recursive: true });
			mkdirSync(join(cwd, ".pi", "skills", "implement"), { recursive: true });
			writeFileSync(join(cwd, ".pi", "skills", "plan", "SKILL.md"), "# plan");
			writeFileSync(join(cwd, ".pi", "skills", "implement", "SKILL.md"), "# implement");
			expect(findWorkflowOverlaps(cwd)).not.toContain("skill:plan");
			expect(findWorkflowOverlaps(cwd)).not.toContain("skill:implement");
		});

		it("detects known plugin packages", () => {
			const home = join(tmpdir(), `openspec-package-overlap-test-${Date.now()}-${Math.random().toString(16).slice(2)}`);
			const oldHome = process.env.PI_OPENSPEC_TEST_HOME;
			process.env.PI_OPENSPEC_TEST_HOME = home;
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(join(home, ".pi", "agent", "settings.json"), JSON.stringify({ packages: ["npm:@juicesharp/rpiv-pi", "npm:pi-superpowers"] }), "utf-8");
			try {
				expect(findWorkflowOverlaps(cwd)).toEqual(["package:@juicesharp/rpiv-pi", "package:pi-superpowers"]);
			} finally {
				if (oldHome === undefined) delete process.env.PI_OPENSPEC_TEST_HOME;
				else process.env.PI_OPENSPEC_TEST_HOME = oldHome;
				rmSync(home, { recursive: true, force: true });
			}
		});
	});

	describe("codebase-memory support", () => {
		it("detects whether the standalone plugin is installed from Pi settings", () => {
			const home = join(tmpdir(), `openspec-plugin-install-test-${Date.now()}-${Math.random().toString(16).slice(2)}`);
			const oldHome = process.env.PI_OPENSPEC_TEST_HOME;
			process.env.PI_OPENSPEC_TEST_HOME = home;
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(join(home, ".pi", "agent", "settings.json"), JSON.stringify({ packages: ["@casualjim/pi-codebase-memory"] }), "utf-8");
			try {
				expect(hasPiCodebaseMemoryInstalled()).toBe(true);
			} finally {
				if (oldHome === undefined) delete process.env.PI_OPENSPEC_TEST_HOME;
				else process.env.PI_OPENSPEC_TEST_HOME = oldHome;
				rmSync(home, { recursive: true, force: true });
			}
		});

		it("reports incomplete support when required tools are missing", () => {
			const status = getCodebaseMemorySupportStatus({
				getAllTools: () => [{ name: "codebase_memory_get_architecture" }],
			});
			expect(status.toolsAvailable).toBe(false);
			expect(status.missingTools).toContain("codebase_memory_search_graph");
			expect(status.installCommand).toBe(CODEBASE_MEMORY_INSTALL_COMMAND);
		});

		it("reports complete support when all required tools are active", () => {
			const status = getCodebaseMemorySupportStatus({
				getAllTools: () => EXPECTED_CODEBASE_MEMORY_TOOLS.map((name) => ({ name })),
			});
			expect(status.toolsAvailable).toBe(true);
			expect(status.missingTools).toEqual([]);
		});
	});
});
