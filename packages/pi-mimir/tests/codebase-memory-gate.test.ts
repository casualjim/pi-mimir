import { describe, expect, it } from "vitest";
import { handleCodebaseMemoryDiscoveryGate, resetCodebaseMemoryGate } from "../extensions/openspec/codebase-memory-gate.js";

describe("codebase-memory discovery guidance", () => {
	it("advises on the first broad raw discovery tool without blocking", () => {
		resetCodebaseMemoryGate();
		const result = handleCodebaseMemoryDiscoveryGate({ toolName: "grep" });
		expect(result).toBeDefined();
		expect(result).not.toHaveProperty("block");
		expect(result?.content).toContain("codebase-memory reminder");
		expect(result?.content).toContain("codebase_memory_search_graph");
		expect(result?.content).toContain("codebase_memory_get_code_snippet");
	});

	it("only advises once for matching calls in the same session", () => {
		resetCodebaseMemoryGate();
		expect(handleCodebaseMemoryDiscoveryGate({ toolName: "find" })).toBeDefined();
		expect(handleCodebaseMemoryDiscoveryGate({ toolName: "find" })).toBeUndefined();
	});

	it("does not advise for read or non-discovery tools", () => {
		resetCodebaseMemoryGate();
		expect(handleCodebaseMemoryDiscoveryGate({ toolName: "read" })).toBeUndefined();
		expect(handleCodebaseMemoryDiscoveryGate({ toolName: "bash" })).toBeUndefined();
		expect(handleCodebaseMemoryDiscoveryGate({ toolName: "edit" })).toBeUndefined();
		expect(handleCodebaseMemoryDiscoveryGate({ toolName: "write" })).toBeUndefined();
	});

	it("reset restores the one-shot advisory", () => {
		resetCodebaseMemoryGate();
		expect(handleCodebaseMemoryDiscoveryGate({ toolName: "grep" })).toBeDefined();
		resetCodebaseMemoryGate();
		expect(handleCodebaseMemoryDiscoveryGate({ toolName: "ls" })).toBeDefined();
	});

	it("tracks one-shot advisory by scope", () => {
		resetCodebaseMemoryGate();
		expect(handleCodebaseMemoryDiscoveryGate({ toolName: "grep" }, "/repo/a")).toBeDefined();
		expect(handleCodebaseMemoryDiscoveryGate({ toolName: "grep" }, "/repo/a")).toBeUndefined();
		expect(handleCodebaseMemoryDiscoveryGate({ toolName: "grep" }, "/repo/b")).toBeDefined();
		resetCodebaseMemoryGate("/repo/a");
		expect(handleCodebaseMemoryDiscoveryGate({ toolName: "grep" }, "/repo/a")).toBeDefined();
		expect(handleCodebaseMemoryDiscoveryGate({ toolName: "grep" }, "/repo/b")).toBeUndefined();
	});
});
