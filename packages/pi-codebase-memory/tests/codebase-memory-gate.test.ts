import { describe, expect, it } from "vitest";
import { CODEBASE_MEMORY_SESSION_REMINDER, extractSearchToken, getRawDiscoverySearchToken, handleCodebaseMemoryDiscoveryGate, isRawDiscoveryCall, resetCodebaseMemoryGate } from "../extensions/codebase-memory/codebase-memory-gate.js";

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

	it("detects Pi bash raw discovery commands", () => {
		expect(isRawDiscoveryCall({ toolName: "bash", input: { command: "rg registerSessionHooks packages" } })).toBe(true);
		expect(isRawDiscoveryCall({ toolName: "bash", input: { command: "find packages -name '*.ts'" } })).toBe(true);
		expect(isRawDiscoveryCall({ toolName: "bash", input: { command: "pnpm test" } })).toBe(false);
	});

	it("extracts graph augmentation tokens from raw discovery", () => {
		expect(extractSearchToken("rg registerSessionHooks packages")).toBe("registerSessionHooks");
		expect(extractSearchToken("ls src")).toBeUndefined();
		expect(getRawDiscoverySearchToken({ toolName: "bash", input: { command: "grep -R handleCodebaseMemoryDiscoveryGate packages" } })).toBe("handleCodebaseMemoryDiscoveryGate");
	});

	it("does not advise for read or non-discovery tools", () => {
		resetCodebaseMemoryGate();
		expect(handleCodebaseMemoryDiscoveryGate({ toolName: "read" })).toBeUndefined();
		expect(handleCodebaseMemoryDiscoveryGate({ toolName: "bash", input: { command: "pnpm test" } })).toBeUndefined();
		expect(handleCodebaseMemoryDiscoveryGate({ toolName: "edit" })).toBeUndefined();
		expect(handleCodebaseMemoryDiscoveryGate({ toolName: "write" })).toBeUndefined();
	});

	it("exports a Claude-parity SessionStart reminder adapted for Pi tools", () => {
		expect(CODEBASE_MEMORY_SESSION_REMINDER).toContain("CRITICAL - Code Discovery Protocol");
		expect(CODEBASE_MEMORY_SESSION_REMINDER).toContain("codebase_memory_search_graph");
		expect(CODEBASE_MEMORY_SESSION_REMINDER).toContain("codebase_memory_index_repository");
	});
});
