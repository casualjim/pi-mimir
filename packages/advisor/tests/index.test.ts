import { describe, expect, it } from "vitest";
import extension from "../extensions/advisor/index.js";
import { createHarness } from "./helpers/pi-harness.js";

describe("advisor extension entry point", () => {
	it("registers advisor tool and command", () => {
		const harness = createHarness();
		extension(harness.pi);
		expect(harness.tools.has("advisor")).toBe(true);
		expect(harness.commands.has("advisor")).toBe(true);
	});

	it("registers lifecycle handlers", () => {
		const harness = createHarness();
		extension(harness.pi);
		expect(harness.handlers.has("session_start")).toBe(true);
		expect(harness.handlers.has("before_agent_start")).toBe(true);
		expect(harness.handlers.has("model_select")).toBe(true);
		expect(harness.handlers.has("thinking_level_select")).toBe(true);
	});
});
