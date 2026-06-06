import type { Api, Model } from "@earendil-works/pi-ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const mocks = vi.hoisted(() => ({ completeSimple: vi.fn() }));

vi.mock("@earendil-works/pi-ai", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@earendil-works/pi-ai")>();
	return { ...actual, completeSimple: mocks.completeSimple };
});

import { registerAdvisorTool, setAdvisorEffort, setAdvisorModel } from "../extensions/advisor/advisor";
import { createHarness } from "./helpers/pi-harness";

type TestModel = Model<Api> & { name: string };
type AdvisorResult = { content: Array<{ type: "text"; text: string }>; details: { errorMessage?: string; advisorModel?: string; effort?: string } };

const advisorModel = { provider: "anthropic", id: "opus", name: "Opus" } as TestModel;
let tempHome = "";

describe("advisor tool execution", () => {
	beforeEach(() => {
		tempHome = mkdtempSync(join(tmpdir(), "advisor-home-"));
		vi.stubEnv("HOME", tempHome);
		mocks.completeSimple.mockReset();
		mocks.completeSimple.mockResolvedValue({
			content: [{ type: "text", text: "PLAN\n- inspect packages/advisor" }],
			usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
			stopReason: "stop",
		});
		setAdvisorModel(undefined);
		setAdvisorEffort(undefined);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		rmSync(tempHome, { recursive: true, force: true });
	});

	it("returns no-model error when advisor is not configured", async () => {
		const harness = createHarness();
		registerAdvisorTool(harness.pi);
		const result = (await harness.tools.get("advisor")?.execute("tc", {}, undefined, undefined, harness.ctx)) as AdvisorResult;
		expect(result.details.errorMessage).toBe("no advisor model selected");
	});

	it("returns advisor guidance from direct advisor model call", async () => {
		setAdvisorModel(advisorModel);
		setAdvisorEffort("high");
		const harness = createHarness();
		registerAdvisorTool(harness.pi);
		const result = (await harness.tools.get("advisor")?.execute("tc", {}, undefined, undefined, harness.ctx)) as AdvisorResult;
		expect(result.content[0]).toMatchObject({ text: expect.stringContaining("PLAN") });
		expect(result.details.advisorModel).toBe("anthropic:opus");
		expect(result.details.effort).toBe("high");
		expect(mocks.completeSimple).toHaveBeenCalledOnce();
	});

	it("returns failure envelope when advisor model errors", async () => {
		mocks.completeSimple.mockResolvedValueOnce({ content: [], usage: undefined, stopReason: "error", errorMessage: "boom" });
		setAdvisorModel(advisorModel);
		const harness = createHarness();
		registerAdvisorTool(harness.pi);
		const result = (await harness.tools.get("advisor")?.execute("tc", {}, undefined, undefined, harness.ctx)) as AdvisorResult;
		expect(result.details.errorMessage).toContain("boom");
	});
});
