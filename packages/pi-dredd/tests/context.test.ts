import { describe, expect, it } from "vitest";
import { buildAppendix, dedupeRuns, repeatedTail, saveOutput, trimOutput, TRIM_OVER } from "../lib/context";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("trimOutput", () => {
	it("leaves short output alone", () => {
		expect(trimOutput("short")).toBe("short");
	});

	it("trims long output and names what was omitted", () => {
		const long = "x".repeat(TRIM_OVER + 5000);
		const trimmed = trimOutput(long);
		expect(trimmed.length).toBeLessThan(long.length);
		expect(trimmed).toContain("pi-dredd trimmed");
		expect(trimmed.startsWith("x")).toBe(true);
		expect(trimmed.endsWith("x")).toBe(true);
	});
});

describe("saveOutput", () => {
	it("writes an owner-only file and returns a pointer", () => {
		const dir = mkdtempSync(join(tmpdir(), "dredd-save-"));
		const saved = saveOutput("full content here", "bash", dir);
		expect(readFileSync(saved.path, "utf-8")).toBe("full content here");
		expect(saved.pointer).toContain(saved.path);
		const mode = statSync(saved.path).mode & 0o077;
		expect(mode).toBe(0);
		rmSync(dir, { recursive: true });
	});

	it("same content saves to the same path", () => {
		const dir = mkdtempSync(join(tmpdir(), "dredd-save-"));
		const a = saveOutput("identical", "bash", dir);
		const b = saveOutput("identical", "bash", dir);
		expect(a.path).toBe(b.path);
		rmSync(dir, { recursive: true });
	});
});

describe("dedupeRuns", () => {
	it("collapses three or more identical lines", () => {
		const out = dedupeRuns(["retry", "retry", "retry", "done"].join("\n"));
		expect(out).toContain("collapsed 3 identical lines");
		expect(out).toContain("done");
	});

	it("leaves two repeats and unique lines alone", () => {
		const text = ["a", "a", "b"].join("\n");
		expect(dedupeRuns(text)).toBe(text);
	});
});

describe("repeatedTail", () => {
	it("detects a repeating tail at the block size", () => {
		const text = "y".repeat(256 * 4);
		expect(repeatedTail(text)).toBe(4);
	});

	it("ignores varied text", () => {
		expect(repeatedTail("unique text each block, nothing repeats here at all")).toBe(0);
	});
});

describe("buildAppendix", () => {
	it("groups entries by kind", () => {
		const text = buildAppendix([
			{ kind: "failed", text: "cargo test (exit 1)" },
			{ kind: "hold", text: "psql TRUNCATE" },
			{ kind: "saved", text: "/tmp/full-output.txt" },
		]);
		expect(text).toContain("Failed attempts: cargo test (exit 1)");
		expect(text).toContain("Holds this session: psql TRUNCATE");
		expect(text).toContain("Saved outputs: /tmp/full-output.txt");
	});

	it("returns empty for no entries", () => {
		expect(buildAppendix([])).toBe("");
	});
});