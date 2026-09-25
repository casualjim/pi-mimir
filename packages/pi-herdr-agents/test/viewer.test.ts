import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { visibleWidth } from "@earendil-works/pi-tui";
import {
	renderTranscriptLines,
	TranscriptViewer,
	transcriptRows,
} from "../pi-extension/subagents/viewer.ts";
import type { SessionEntry } from "../pi-extension/subagents/session.ts";

function messageEntry(
	id: string,
	role: "user" | "assistant" | "toolResult",
	blocks: Array<{ type: string; text?: string; name?: string }>,
): SessionEntry {
	return { type: "message", id, message: { role, content: blocks } };
}

describe("fleet viewer", () => {
	it("collapses sessions into bounded transcript rows", () => {
		const rows = transcriptRows([
			messageEntry("1", "user", [{ type: "text", text: "fix the bug" }]),
			messageEntry("2", "assistant", [
				{ type: "thinking", text: "hmm" },
				{ type: "text", text: "working on it" },
				{ type: "tool_use", name: "read" },
			]),
			messageEntry("3", "toolResult", [{ type: "text", text: "noise" }]),
			{ type: "compaction", id: "4" },
		]);
		assert.deepEqual(rows, [
			{ kind: "user", text: "› fix the bug" },
			{ kind: "assistant", text: "working on it" },
			{ kind: "tool", text: "→ read" },
			{ kind: "meta", text: "· session compacted" },
		]);
	});

	it("wraps rows to the render width and windows the tail", () => {
		const rows = [
			{ kind: "assistant" as const, text: "word ".repeat(30).trim() },
		];
		const lines = renderTranscriptLines(rows, 40, 5, 0);
		assert.ok(lines.length <= 5);
		for (const line of lines) assert.ok(visibleWidth(line) <= 40);
		const scrolled = renderTranscriptLines(rows, 40, 5, 1);
		assert.equal(scrolled.length, lines.length - 1);
	});

	it("renders, scrolls, switches targets, and closes", () => {
		const root = mkdtempSync(join(tmpdir(), "viewer-test-"));
		try {
			const first = join(root, "first.jsonl");
			const second = join(root, "second.jsonl");
			writeFileSync(
				first,
				`${JSON.stringify(messageEntry("1", "user", [{ type: "text", text: "first child task" }]))}\n`,
			);
			writeFileSync(
				second,
				`${JSON.stringify(messageEntry("1", "user", [{ type: "text", text: "second child task" }]))}\n`,
			);
			let closed = 0;
			const viewer = new TranscriptViewer({
				targets: [
					{ name: "Alpha", sessionFile: first },
					{ name: "Beta", sessionFile: second },
				],
				done: () => {
					closed++;
				},
			});
			const rendered = viewer.render(60);
			assert.match(rendered[0], /^Alpha · 1\/2 · 1 entries/);
			assert.ok(rendered.some((line) => line.includes("first child task")));

			viewer.handleInput("n");
			assert.match(viewer.render(60)[0], /^Beta · 2\/2/);
			assert.ok(
				viewer.render(60).some((line) => line.includes("second child task")),
			);

			viewer.handleInput("p");
			assert.match(viewer.render(60)[0], /^Alpha · 1\/2/);

			viewer.handleInput("k");
			viewer.handleInput("j");
			viewer.handleInput("q");
			assert.equal(closed, 1);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("picks up new session entries on refresh", () => {
		const root = mkdtempSync(join(tmpdir(), "viewer-refresh-"));
		try {
			const sessionFile = join(root, "child.jsonl");
			writeFileSync(
				sessionFile,
				`${JSON.stringify(messageEntry("1", "user", [{ type: "text", text: "initial" }]))}\n`,
			);
			const viewer = new TranscriptViewer({
				targets: [{ name: "Only", sessionFile }],
				done: () => {},
			});
			assert.ok(viewer.render(60).some((line) => line.includes("initial")));
			writeFileSync(
				sessionFile,
				`${JSON.stringify(messageEntry("1", "user", [{ type: "text", text: "initial" }]))}\n${JSON.stringify(messageEntry("2", "assistant", [{ type: "text", text: "follow-up answer" }]))}\n`,
			);
			viewer.refresh(true);
			assert.ok(
				viewer.render(60).some((line) => line.includes("follow-up answer")),
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("shows a placeholder when the session has not started", () => {
		const viewer = new TranscriptViewer({
			targets: [{ name: "Ghost", sessionFile: "/nonexistent/child.jsonl" }],
			done: () => {},
		});
		assert.ok(viewer.render(60).some((line) => line.includes("not started")));
	});
});
