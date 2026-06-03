import { describe, it, expect } from "vitest";
import { createHarness } from "./helpers/pi-harness.js";
import extension from "../extensions/openspec/index.js";

describe("extension entry point", () => {
	it("registers the debug flag", () => {
		const harness = createHarness();
		extension(harness.pi);
		expect(harness.flags.has("openspec-debug")).toBe(true);
	});

	it("registers session hooks (session_start handler)", () => {
		const harness = createHarness();
		extension(harness.pi);
		expect(harness.handlers.has("session_start")).toBe(true);
	});

	it("registers session_compact handler", () => {
		const harness = createHarness();
		extension(harness.pi);
		expect(harness.handlers.has("session_compact")).toBe(true);
	});

	it("registers session_shutdown handler", () => {
		const harness = createHarness();
		extension(harness.pi);
		expect(harness.handlers.has("session_shutdown")).toBe(true);
	});

	it("registers tool_call handler", () => {
		const harness = createHarness();
		extension(harness.pi);
		expect(harness.handlers.has("tool_call")).toBe(true);
	});

	it("registers before_agent_start handler", () => {
		const harness = createHarness();
		extension(harness.pi);
		expect(harness.handlers.has("before_agent_start")).toBe(true);
	});

	it("does not register removed /openspec-setup command", () => {
		const harness = createHarness();
		extension(harness.pi);
		expect(harness.commands.has("openspec-setup")).toBe(false);
	});

	it("registers /openspec:update command", () => {
		const harness = createHarness();
		extension(harness.pi);
		expect(harness.commands.has("openspec:update")).toBe(true);
		expect(harness.commands.has("openspec-update-agents")).toBe(false);
	});

	it("registers /openspec:* commands", () => {
		const harness = createHarness();
		extension(harness.pi);
		expect(harness.commands.has("openspec:init")).toBe(true);
		expect(harness.commands.has("openspec:status")).toBe(true);
		expect(harness.commands.has("openspec:list")).toBe(true);
	});
});
