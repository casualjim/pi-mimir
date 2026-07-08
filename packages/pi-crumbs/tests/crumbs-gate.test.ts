import { describe, expect, it } from "vitest";
import { CRUMBS_SESSION_REMINDER, extractSearchToken, getRawDiscoverySearchToken, handleCrumbsDiscoveryGate, isRawDiscoveryCall, resetCrumbsGate } from "../extensions/crumbs/crumbs-gate.js";

describe("crumbs discovery guidance", () => {
	it("advises on the first broad raw discovery tool without blocking", () => {
		resetCrumbsGate();
		const result = handleCrumbsDiscoveryGate({ toolName: "grep" });
		expect(result).toBeDefined();
		expect(result).not.toHaveProperty("block");
		expect(result?.content).toContain("code_crumbs reminder");
		expect(result?.content).toContain("code_crumbs_search_graph");
		expect(result?.content).toContain("code_crumbs_get_architecture");
		expect(result?.content).toContain("code_crumbs_index");
	});

	it("only advises once for matching calls in the same session", () => {
		resetCrumbsGate();
		expect(handleCrumbsDiscoveryGate({ toolName: "find" })).toBeDefined();
		expect(handleCrumbsDiscoveryGate({ toolName: "find" })).toBeUndefined();
	});

	it("detects Pi bash raw discovery commands", () => {
		expect(isRawDiscoveryCall({ toolName: "bash", input: { command: "rg registerSessionHooks packages" } })).toBe(true);
		expect(isRawDiscoveryCall({ toolName: "bash", input: { command: "find packages -name '*.ts'" } })).toBe(true);
		expect(isRawDiscoveryCall({ toolName: "bash", input: { command: "pnpm test" } })).toBe(false);
	});

	it("extracts graph augmentation tokens from raw discovery", () => {
		expect(extractSearchToken("rg registerSessionHooks packages")).toBe("registerSessionHooks");
		expect(extractSearchToken("ls src")).toBeUndefined();
		expect(getRawDiscoverySearchToken({ toolName: "bash", input: { command: "grep -R handleCrumbsDiscoveryGate packages" } })).toBe("handleCrumbsDiscoveryGate");
	});

	it("does not advise for read or non-discovery tools", () => {
		resetCrumbsGate();
		expect(handleCrumbsDiscoveryGate({ toolName: "read" })).toBeUndefined();
		expect(handleCrumbsDiscoveryGate({ toolName: "bash", input: { command: "pnpm test" } })).toBeUndefined();
		expect(handleCrumbsDiscoveryGate({ toolName: "edit" })).toBeUndefined();
		expect(handleCrumbsDiscoveryGate({ toolName: "write" })).toBeUndefined();
	});

	it("exports a session reminder pointing at crumbs MCP tools", () => {
		expect(CRUMBS_SESSION_REMINDER).toContain("CRITICAL - Crumbs Discovery Protocol");
		expect(CRUMBS_SESSION_REMINDER).toContain("code_crumbs_search_graph");
		expect(CRUMBS_SESSION_REMINDER).toContain("code_crumbs_index");
		expect(CRUMBS_SESSION_REMINDER).not.toMatch(/crumbs_graph_search/);
	});
});
