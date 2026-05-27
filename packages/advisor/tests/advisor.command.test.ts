import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("../extensions/advisor/advisor-ui.js", () => ({
	showAdvisorPicker: vi.fn(),
	showEffortPicker: vi.fn(),
}));

import {
	ADVISOR_TOOL_NAME,
	getAdvisorEffort,
	getAdvisorModel,
	registerAdvisorBeforeAgentStart,
	registerAdvisorCommand,
	registerModelSelectHandler,
	registerThinkingLevelSelectHandler,
	restoreAdvisorState,
	setAdvisorEffort,
	setAdvisorModel,
} from "../extensions/advisor/advisor.js";
import { showAdvisorPicker, showEffortPicker } from "../extensions/advisor/advisor-ui.js";
import { createHarness } from "./helpers/pi-harness.js";

const modelA = { provider: "anthropic", id: "opus", name: "Opus" } as any;
const modelR = { provider: "anthropic", id: "opus-thinking", name: "Opus Thinking", reasoning: true } as any;
const executorModel = { provider: "openai", id: "gpt-5", name: "GPT-5" } as any;
let tempHome = "";

beforeEach(() => {
	tempHome = mkdtempSync(join(tmpdir(), "advisor-home-"));
	process.env.PI_MIMIR_ADVISOR_HOME = tempHome;
	setAdvisorModel(undefined);
	setAdvisorEffort(undefined);
	vi.mocked(showAdvisorPicker).mockReset();
	vi.mocked(showEffortPicker).mockReset();
});

afterEach(() => {
	delete process.env.PI_MIMIR_ADVISOR_HOME;
	rmSync(tempHome, { recursive: true, force: true });
});

describe("/advisor", () => {
	it("requires interactive mode", async () => {
		const harness = createHarness({ availableModels: [modelA] });
		harness.ctx.hasUI = false;
		registerAdvisorCommand(harness.pi);
		await harness.commands.get("advisor").handler("", harness.ctx);
		expect(harness.notifications.at(-1)).toMatchObject({ level: "error" });
	});

	it("disables advisor when no advisor is chosen", async () => {
		vi.mocked(showAdvisorPicker).mockResolvedValueOnce("__no_advisor__");
		const harness = createHarness({ availableModels: [modelA], toolNames: [ADVISOR_TOOL_NAME, "read"] });
		registerAdvisorCommand(harness.pi);
		setAdvisorModel(modelA);
		await harness.commands.get("advisor").handler("", harness.ctx);
		expect(getAdvisorModel()).toBeUndefined();
		expect(getAdvisorEffort()).toBeUndefined();
		expect(harness.activeTools).toEqual(["read"]);
	});

	it("selects a non-reasoning model", async () => {
		vi.mocked(showAdvisorPicker).mockResolvedValueOnce("anthropic:opus");
		const harness = createHarness({ availableModels: [modelA], currentModel: executorModel });
		registerAdvisorCommand(harness.pi);
		await harness.commands.get("advisor").handler("", harness.ctx);
		expect(getAdvisorModel()).toBe(modelA);
		expect(getAdvisorEffort()).toBeUndefined();
		expect(harness.activeTools).toContain(ADVISOR_TOOL_NAME);
	});

	it("selects effort for a reasoning-capable model", async () => {
		vi.mocked(showAdvisorPicker).mockResolvedValueOnce("anthropic:opus-thinking");
		vi.mocked(showEffortPicker).mockResolvedValueOnce("medium");
		const harness = createHarness({ availableModels: [modelR], currentModel: executorModel });
		registerAdvisorCommand(harness.pi);
		await harness.commands.get("advisor").handler("", harness.ctx);
		expect(getAdvisorModel()).toBe(modelR);
		expect(getAdvisorEffort()).toBe("medium");
	});
});

describe("advisor activation handlers", () => {
	it("strips advisor when no model is configured", async () => {
		const harness = createHarness({ toolNames: [ADVISOR_TOOL_NAME, "read"] });
		registerAdvisorBeforeAgentStart(harness.pi);
		await harness.emit("before_agent_start");
		expect(harness.activeTools).toEqual(["read"]);
	});

	it("re-adds advisor when model switch unblocks it", async () => {
		setAdvisorModel(modelA);
		const harness = createHarness({ currentModel: executorModel, toolNames: ["read"] });
		registerModelSelectHandler(harness.pi);
		await harness.emit("model_select", { source: "user", model: executorModel });
		expect(harness.activeTools).toContain(ADVISOR_TOOL_NAME);
	});

	it("keeps advisor on thinking-level changes when not blocked", async () => {
		setAdvisorModel(modelA);
		const harness = createHarness({ currentModel: executorModel, toolNames: [ADVISOR_TOOL_NAME] });
		registerThinkingLevelSelectHandler(harness.pi);
		await harness.emit("thinking_level_select", { level: "medium" });
		expect(harness.activeTools).toContain(ADVISOR_TOOL_NAME);
	});
});

describe("restoreAdvisorState", () => {
	it("restores nothing when no config exists", () => {
		const harness = createHarness({ availableModels: [modelA] });
		restoreAdvisorState(harness.ctx, harness.pi);
		expect(getAdvisorModel()).toBeUndefined();
	});
});
