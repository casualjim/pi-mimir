/** Runaway detection and compaction evidence. */

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
	kind: "failed" | "hold";
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
	return parts.join("\n");
}