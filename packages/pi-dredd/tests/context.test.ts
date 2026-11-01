import { describe, expect, it } from "vitest";
import { buildAppendix, repeatedTail } from "../lib/context";
import { registerContext } from "../extensions/dredd";

describe("context registration", () => {
	it("does not intercept bash results while keeping runaway and compaction handlers", () => {
		const events: string[] = [];
		const pi = { on: (event: string) => events.push(event) };
		registerContext(pi as never, { config: { enabled: true } } as never);
		expect(events).not.toContain("tool_result");
		expect(events).toContain("message_update");
		expect(events).toContain("session_compact");
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
		]);
		expect(text).toContain("Failed attempts: cargo test (exit 1)");
		expect(text).toContain("Holds this session: psql TRUNCATE");
	});

	it("returns empty for no entries", () => {
		expect(buildAppendix([])).toBe("");
	});
});