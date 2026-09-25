import { isRecord, isString } from "./type-guards.ts";
import {
	matchesKey,
	visibleWidth,
	type Focusable,
} from "@earendil-works/pi-tui";
import { getNewEntries, type SessionEntry } from "./session.ts";

/** One child session inspectable from the fleet viewer. */
export interface ViewerTarget {
	name: string;
	sessionFile: string;
}

type TranscriptRowKind = "user" | "assistant" | "tool" | "meta";

export interface TranscriptRow {
	kind: TranscriptRowKind;
	text: string;
}

const VIEWER_MAX_LINES = 30;
const REFRESH_INTERVAL_MS = 750;
const MIN_RENDER_WIDTH = 20;

function messageEntry(entry: SessionEntry):
	| {
			role: string;
			blocks: Array<{ type: string; text?: string; name?: string }>;
	  }
	| undefined {
	if (entry.type !== "message") return undefined;
	const message = entry.message;
	if (
		message == null ||
		!isRecord(message) ||
		!isString(message.role) ||
		!Array.isArray(message.content)
	)
		return undefined;
	return { role: message.role, blocks: message.content };
}

function blockText(block: { type: string; text?: string }): string | undefined {
	if (block.type !== "text") return undefined;
	return isString(block.text) && block.text.trim().length > 0
		? block.text
		: undefined;
}

/** Collapse a child session into bounded display rows. */
export function transcriptRows(entries: SessionEntry[]): TranscriptRow[] {
	const rows: TranscriptRow[] = [];
	for (const entry of entries) {
		if (entry.type === "compaction") {
			rows.push({ kind: "meta", text: "· session compacted" });
			continue;
		}
		const message = messageEntry(entry);
		if (!message) continue;
		if (message.role === "user") {
			const text = message.blocks
				.map(blockText)
				.filter(Boolean)
				.join("\n")
				.replace(/\s+/g, " ")
				.trim();
			if (text) rows.push({ kind: "user", text: `› ${text}` });
			continue;
		}
		if (message.role === "assistant") {
			for (const block of message.blocks) {
				const text = blockText(block);
				if (text) rows.push({ kind: "assistant", text });
				else if (block.type === "tool_use" && isString(block.name))
					rows.push({ kind: "tool", text: `→ ${block.name}` });
			}
		}
		// toolResult rows are skipped: tool names plus assistant text carry the story.
	}
	return rows;
}

function wrapPlain(text: string, width: number): string[] {
	const lines: string[] = [];
	for (const paragraph of text.split("\n")) {
		if (paragraph.trim().length === 0) {
			lines.push("");
			continue;
		}
		let current = "";
		for (const word of paragraph.split(/\s+/)) {
			const candidate = current.length === 0 ? word : `${current} ${word}`;
			if (visibleWidth(candidate) <= width) {
				current = candidate;
				continue;
			}
			if (current.length > 0) lines.push(current);
			current = word.slice(0, width);
		}
		if (current.length > 0) lines.push(current);
	}
	return lines.length > 0 ? lines : [""];
}

/**
 * Project transcript rows into a tail window of plain lines that each fit
 * `width`; `scroll` moves the window upward from the newest entry.
 */
export function renderTranscriptLines(
	rows: TranscriptRow[],
	width: number,
	maxLines = VIEWER_MAX_LINES,
	scroll = 0,
): string[] {
	const usable = Math.max(MIN_RENDER_WIDTH, width - 2);
	const flat: string[] = [];
	for (const row of rows) flat.push(...wrapPlain(row.text, usable));
	const end = Math.max(0, flat.length - scroll);
	const start = Math.max(0, end - maxLines);
	return flat.slice(start, end);
}

/** Focused overlay that tails one child session and navigates the fleet. */
export class TranscriptViewer implements Focusable {
	focused = false;

	private readonly params: {
		targets: ViewerTarget[];
		initial?: number;
		done: () => void;
		now?: () => number;
	};
	private targetIndex: number;
	private scroll = 0;
	private rows: TranscriptRow[] = [];
	private lastReadAt = 0;

	constructor(params: {
		targets: ViewerTarget[];
		initial?: number;
		done: () => void;
		now?: () => number;
	}) {
		this.params = params;
		this.targetIndex = Math.min(
			Math.max(0, params.initial ?? 0),
			Math.max(0, params.targets.length - 1),
		);
		this.refresh(true);
	}

	private target(): ViewerTarget | undefined {
		return this.params.targets[this.targetIndex];
	}

	/** Re-read the active child session; throttled while rendering. */
	refresh(force = false): void {
		const now = this.params.now?.() ?? Date.now();
		if (!force && now - this.lastReadAt < REFRESH_INTERVAL_MS) return;
		this.lastReadAt = now;
		const target = this.target();
		if (!target) {
			this.rows = [];
			return;
		}
		try {
			this.rows = transcriptRows(getNewEntries(target.sessionFile, 0));
		} catch {
			// A missing or unreadable session means the child has not started yet.
			this.rows = [{ kind: "meta", text: "· session not started yet" }];
		}
		this.scroll = Math.min(this.scroll, Math.max(0, this.rows.length - 1));
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape") || data === "q") {
			this.params.done();
			return;
		}
		if (matchesKey(data, "up") || data === "k") {
			this.refresh();
			this.scroll = Math.min(this.scroll + 1, this.rows.length);
			return;
		}
		if (matchesKey(data, "down") || data === "j") {
			this.scroll = Math.max(0, this.scroll - 1);
			return;
		}
		if (data === "n" || data === "p") {
			const count = this.params.targets.length;
			if (count < 2) return;
			const step = data === "n" ? 1 : -1;
			this.targetIndex = (this.targetIndex + step + count) % count;
			this.scroll = 0;
			this.refresh(true);
		}
	}

	render(width: number): string[] {
		this.refresh();
		const target = this.target();
		if (!target) return ["No subagent sessions to view."];
		const header = `${target.name} · ${this.targetIndex + 1}/${this.params.targets.length} · ${this.rows.length} entries · ↑↓ scroll · n/p child · q close`;
		return [
			header,
			...renderTranscriptLines(this.rows, width, VIEWER_MAX_LINES, this.scroll),
		];
	}

	invalidate(): void {}
}
