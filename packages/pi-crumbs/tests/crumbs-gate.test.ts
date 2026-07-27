import { describe, expect, it } from "vitest";
import { CRUMBS_SESSION_REMINDER, extractSearchToken, getRawDiscoverySearchToken, handleCrumbsDiscoveryGate, isOrientationCall, isRawDiscoveryCall, resetCrumbsGate } from "../extensions/crumbs/crumbs-gate.js";

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

	it("advises on repo-orientation commands, which precede raw discovery", () => {
		for (const command of ["git log --oneline -20", "git diff", "git status", "tree -L 2", "wc -l *.py"]) {
			expect(isOrientationCall({ toolName: "bash", input: { command } })).toBe(true);
			resetCrumbsGate();
			expect(handleCrumbsDiscoveryGate({ toolName: "bash", input: { command } })).toBeDefined();
		}
		expect(isOrientationCall({ toolName: "bash", input: { command: "git commit -m wip" } })).toBe(false);
		expect(isOrientationCall({ toolName: "bash", input: { command: "pnpm test" } })).toBe(false);
	});

	it("keeps augmentation off orientation commands — the token would be junk", () => {
		expect(getRawDiscoverySearchToken({ toolName: "bash", input: { command: "git log --oneline -20" } })).toBeUndefined();
	});

	it("exports a session reminder pointing at crumbs MCP tools", () => {
		expect(CRUMBS_SESSION_REMINDER).toContain("CRITICAL - Code Discovery Protocol");
		expect(CRUMBS_SESSION_REMINDER).toContain("code_crumbs_search_graph");
		expect(CRUMBS_SESSION_REMINDER).toContain("code_crumbs_index");
		expect(CRUMBS_SESSION_REMINDER).not.toMatch(/crumbs_graph_search/);
	});

	it("leads with search_code, the highest-traffic discovery tool", () => {
		const lines = CRUMBS_SESSION_REMINDER.split("\n");
		const searchCode = lines.findIndex((l) => l.includes("code_crumbs_search_code"));
		const unified = lines.findIndex((l) => l.includes("code_crumbs_search_unified"));
		expect(searchCode).toBeGreaterThan(-1);
		expect(searchCode).toBeLessThan(unified);
	});

	it("flags search_unified as slower so it is not the opening move", () => {
		const unifiedLine = CRUMBS_SESSION_REMINDER.split("\n").find((l) => l.includes("code_crumbs_search_unified"));
		expect(unifiedLine).toMatch(/slower/i);
		expect(unifiedLine).toContain("code_crumbs_search_code");
	});
});
