/**
 * Context guards: everything that keeps tool output from flooding the
 * conversation. Trim cuts long output to the parts that matter, save stores
 * the full copy on disk with an owner-only temp file, dedupe collapses
 * identical repeated output, runaway aborts a stream repeating itself, and
 * the compaction appendix names failed attempts, holds, and saved paths so a
 * compacted agent still knows where the evidence lives.
 */
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

export const TRIM_OVER = 12_000;
export const TRIM_KEEP = 0.3;

/** Cut long output to head and tail with a note naming what was left out. */
export function trimOutput(output: string, over = TRIM_OVER, keep = TRIM_KEEP): string {
	if (output.length <= over) return output;
	const keepChars = Math.floor(output.length * keep);
	const head = Math.floor(keepChars / 2);
	const tail = keepChars - head;
	const omitted = output.length - keepChars;
	return `${output.slice(0, head)}\n… pi-dredd trimmed ${omitted} characters; the full output is saved alongside …\n${output.slice(output.length - tail)}`;
}

/** A saved full output: path plus a pointer line for the trimmed display. */
export interface SavedOutput {
	path: string;
	pointer: string;
}

/** Store the full output owner-only and return the pointer text. */
export function saveOutput(output: string, key: string, dir = join(tmpdir(), "pi-dredd")): SavedOutput {
	mkdirSync(dir, { recursive: true });
	const hash = createHash("sha256").update(output).digest("hex").slice(0, 12);
	const path = join(dir, `${key}-${hash}.txt`);
	writeFileSync(path, output, { mode: 0o600 });
	return { path, pointer: `full output saved at ${path}` };
}

export function dropSaved(path: string): void {
	rmSync(path, { force: true });
}

/** Collapse exact repeated runs inside a single output. */
export function dedupeRuns(output: string, minRepeat = 3): string {
	const lines = output.split("\n");
	const out: string[] = [];
	let runStart = 0;
	const flushRun = (end: number) => {
		const run = lines.slice(runStart, end);
		const count = run.length;
		if (count >= minRepeat) {
			out.push(`${run[0]}`);
			out.push(`… pi-dredd collapsed ${count} identical lines …`);
		} else {
			out.push(...run);
		}
	};
	for (let i = 1; i <= lines.length; i++) {
		if (i === lines.length || lines[i] !== lines[runStart]) {
			flushRun(i);
			runStart = i;
		}
	}
	return out.join("\n");
}

/** Runaway detection on a streaming message: the same block repeating. */
export const RUNAWAY_REPEATS = 4;
export const RUNAWAY_BLOCK = 256;

/**
 * Count how many times the tail of `text` repeats the same block. Returns the
 * repeat count when it reaches `repeats`, else 0.
 */
export function repeatedTail(text: string, block = RUNAWAY_BLOCK, repeats = RUNAWAY_REPEATS): number {
	const blocks: string[] = [];
	for (let i = 0; i < text.length; i += block) blocks.push(text.slice(i, i + block));
	if (blocks.length < repeats) return 0;
	const tail = blocks.slice(-repeats + 1);
	const first = tail[0] ?? "";
	if (tail.every(b => b === first) && first.length === block) return repeats;
	return 0;
}

/** One entry of the compaction appendix. */
export interface AppendixEntry {
	kind: "failed" | "hold" | "saved";
	text: string;
}

/** Build the compaction appendix from what the guards saw this session. */
export function buildAppendix(entries: readonly AppendixEntry[]): string {
	if (entries.length === 0) return "";
	const grouped = new Map<string, string[]>();
	for (const e of entries) {
		const list = grouped.get(e.kind) ?? [];
		list.push(e.text);
		grouped.set(e.kind, list);
	}
	const parts: string[] = ["pi-dredd evidence appendix:"];
	const failed = grouped.get("failed");
	if (failed && failed.length > 0) parts.push(`Failed attempts: ${failed.join("; ")}`);
	const holds = grouped.get("hold");
	if (holds && holds.length > 0) parts.push(`Holds this session: ${holds.join("; ")}`);
	const saved = grouped.get("saved");
	if (saved && saved.length > 0) parts.push(`Saved outputs: ${saved.join("; ")}`);
	return parts.join("\n");
}