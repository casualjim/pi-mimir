import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@earendil-works/pi-coding-agent")>();
	return {
		...actual,
		SessionManager: {
			open: vi.fn(() => ({
				createBranchedSession: vi.fn(() => "/tmp/forked-session.jsonl"),
			})),
		},
	};
});

import { registerAdvisorTool, setAdvisorEffort, setAdvisorModel } from "../extensions/advisor/advisor.js";
import { createHarness } from "./helpers/pi-harness.js";

const advisorModel = { provider: "anthropic", id: "opus", name: "Opus" } as any;
let tempHome = "";
let parentSessionFile = "";
const forkedSessionFile = "/tmp/forked-session.jsonl";

describe("advisor tool execution", () => {
	beforeEach(() => {
		tempHome = mkdtempSync(join(tmpdir(), "advisor-home-"));
		process.env.PI_MIMIR_ADVISOR_HOME = tempHome;
		parentSessionFile = join(tempHome, "parent-session.jsonl");
		writeFileSync(parentSessionFile, "{}\n", "utf-8");
		writeFileSync(forkedSessionFile, "{}\n", "utf-8");
		setAdvisorModel(undefined);
		setAdvisorEffort(undefined);
	});

	afterEach(() => {
		delete process.env.PI_MIMIR_ADVISOR_HOME;
		rmSync(tempHome, { recursive: true, force: true });
		rmSync(forkedSessionFile, { force: true });
	});

	it("returns no-model error when advisor is not configured", async () => {
		const harness = createHarness();
		registerAdvisorTool(harness.pi);
		const result = await harness.tools.get("advisor").execute("tc", {}, undefined, undefined, harness.ctx);
		expect(result.details.errorMessage).toBe("no advisor model selected");
	});

	it("returns advisor guidance from forked child execution", async () => {
		setAdvisorModel(advisorModel);
		setAdvisorEffort("high");
		const harness = createHarness({
			sessionFile: parentSessionFile,
			execStubs: {
				["pi --mode text -p --session /tmp/forked-session.jsonl --model anthropic/opus:high --tools read,grep,find,ls,codebase_memory_get_architecture,codebase_memory_search_graph,codebase_memory_search_code,codebase_memory_trace_path,codebase_memory_get_code_snippet --no-skills --system-prompt /tmp/IGNORED/advisor-system.txt Task: Review the inherited parent branch context and return only PLAN, CORRECTION, or STOP guidance for the parent executor. Be concise and directive."]: { code: 0, stdout: "PLAN\n- inspect packages/advisor", stderr: "" },
			},
		});
		harness.pi.exec = vi.fn(async (cmd: string, args: string[]) => {
			harness.execCalls.push({ cmd, args: [...args] });
			const systemPromptIdx = args.indexOf("--system-prompt");
			if (systemPromptIdx >= 0) args[systemPromptIdx + 1] = "/tmp/IGNORED/advisor-system.txt";
			return { code: 0, stdout: "PLAN\n- inspect packages/advisor", stderr: "" };
		});
		registerAdvisorTool(harness.pi);
		const result = await harness.tools.get("advisor").execute("tc", {}, undefined, undefined, harness.ctx);
		expect(result.content[0]).toMatchObject({ text: expect.stringContaining("PLAN") });
		expect(result.details.childSessionFile).toBe("/tmp/forked-session.jsonl");
	});

	it("returns a failure envelope when the child execution fails", async () => {
		setAdvisorModel(advisorModel);
		const harness = createHarness({ sessionFile: parentSessionFile });
		harness.pi.exec = vi.fn(async () => ({ code: 1, stdout: "", stderr: "boom" }));
		registerAdvisorTool(harness.pi);
		const result = await harness.tools.get("advisor").execute("tc", {}, undefined, undefined, harness.ctx);
		expect(result.details.errorMessage).toContain("boom");
	});

	it("fails clearly when the parent session is not persisted", async () => {
		setAdvisorModel(advisorModel);
		const harness = createHarness({ sessionFile: undefined });
		registerAdvisorTool(harness.pi);
		const result = await harness.tools.get("advisor").execute("tc", {}, undefined, undefined, harness.ctx);
		expect(result.details.errorMessage).toContain("persisted parent session");
	});
});
