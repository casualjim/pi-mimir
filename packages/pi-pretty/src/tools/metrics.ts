/**
 * pi-pretty: tool metrics wrapper — elapsed time + output size.
 *
 * Wraps execute functions to record performance metadata in result.details.
 */

import type { AgentToolResult, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { CHARS_KEY, ELAPSED_KEY } from "../helpers.js";

type ExecuteFn = (
	tid: string,
	params: any,
	sig: AbortSignal | undefined,
	_upd: unknown,
	ctx: ExtensionContext,
) => Promise<AgentToolResult<Record<string, unknown>>>;

export interface RejectedExecutionMetrics {
	elapsedMs: number;
	chars: number;
}

export type RejectedExecutionHandler = (toolCallId: string, metrics: RejectedExecutionMetrics) => void;

export function wrapExecuteWithMetrics(execute: ExecuteFn, onRejected?: RejectedExecutionHandler): ExecuteFn {
	return async (tid, params, sig, upd, ctx) => {
		const start = performance.now();
		try {
			const result = await execute(tid, params, sig, upd, ctx);
			const elapsedMs = performance.now() - start;
			const details = (result.details ?? {}) as Record<string, unknown>;
			details[ELAPSED_KEY] = elapsedMs;
			details[CHARS_KEY] = getOutputCharCount(result);
			(result as { details: Record<string, unknown> }).details = details;
			return result;
		} catch (error) {
			onRejected?.(tid, {
				elapsedMs: performance.now() - start,
				chars: getErrorCharCount(error),
			});
			throw error;
		}
	};
}

function getErrorCharCount(error: unknown): number {
	const text = error instanceof Error ? error.message : String(error);
	return text.replace(/\r/g, "").length;
}

function getOutputCharCount(result: AgentToolResult<unknown>): number {
	const content = result.content;
	if (!Array.isArray(content)) return 0;
	let length = 0;
	for (const block of content) {
		if (block.type !== "text") continue;
		length += String(block.text ?? "").replace(/\r/g, "").length;
	}
	return length;
}
