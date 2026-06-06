/**
 * context — branch-message massaging for the advisor side-call. Strips the
 * executor's in-flight advisor() toolCall from the tail (orphan toolCalls are
 * rejected by providers) and guarantees a user-role tail (some providers reject
 * an assistant-prefill tail).
 */

import type { Message } from "@earendil-works/pi-ai";
import type { SessionContext, SessionEntry } from "@earendil-works/pi-coding-agent";
import { ADVISOR_TOOL_NAME, MSG_ADVISOR_NUDGE } from "./messages";

type AdvisorMessage = SessionContext["messages"][number];
type AssistantContent = Extract<Message, { role: "assistant" }>["content"][number];

export interface AdvisorSessionContext {
	messages: SessionContext["messages"];
	thinkingLevel: string;
	model: { provider: string; modelId: string } | null;
}

function customMessage(entry: Extract<SessionEntry, { type: "custom_message" }>): AdvisorMessage {
	return {
		role: "custom",
		customType: entry.customType,
		content: entry.content,
		display: entry.display,
		details: entry.details,
		timestamp: new Date(entry.timestamp).getTime(),
	} as AdvisorMessage;
}

function branchSummaryMessage(entry: Extract<SessionEntry, { type: "branch_summary" }>): AdvisorMessage {
	return {
		role: "branchSummary",
		summary: entry.summary,
		fromId: entry.fromId,
		timestamp: new Date(entry.timestamp).getTime(),
	} as AdvisorMessage;
}

function compactionSummaryMessage(entry: Extract<SessionEntry, { type: "compaction" }>): AdvisorMessage {
	return {
		role: "compactionSummary",
		summary: entry.summary,
		tokensBefore: entry.tokensBefore,
		timestamp: new Date(entry.timestamp).getTime(),
	} as AdvisorMessage;
}

function appendMessage(messages: SessionContext["messages"], entry: SessionEntry): void {
	if (entry.type === "message") messages.push(entry.message);
	else if (entry.type === "custom_message") messages.push(customMessage(entry));
	else if (entry.type === "branch_summary" && entry.summary) messages.push(branchSummaryMessage(entry));
	else if (entry.type === "compaction") messages.push(compactionSummaryMessage(entry));
}

function isInflightAdvisorToolCall(content: AssistantContent): boolean {
	return content.type === "toolCall" && content.name === ADVISOR_TOOL_NAME;
}

/**
 * Advisor-specific context builder. Mirrors Pi session path traversal, but stops
 * upward walk at first compaction summary or root, whichever comes first.
 */
export function buildAdvisorSessionContext(entries: SessionEntry[], leafId?: string | null): AdvisorSessionContext {
	const byId = new Map<string, SessionEntry>();
	for (const entry of entries) byId.set(entry.id, entry);
	if (leafId === null) return { messages: [], thinkingLevel: "off", model: null };

	let leaf: SessionEntry | undefined;
	if (leafId) leaf = byId.get(leafId);
	if (!leaf) leaf = entries[entries.length - 1];
	if (!leaf) return { messages: [], thinkingLevel: "off", model: null };

	const path: SessionEntry[] = [];
	let current: SessionEntry | undefined = leaf;
	while (current) {
		path.unshift(current);
		if (current.type === "compaction") break;
		current = current.parentId ? byId.get(current.parentId) : undefined;
	}

	let thinkingLevel = "off";
	let model: { provider: string; modelId: string } | null = null;
	const messages: SessionContext["messages"] = [];
	for (const entry of path) {
		if (entry.type === "thinking_level_change") thinkingLevel = entry.thinkingLevel;
		else if (entry.type === "model_change") model = { provider: entry.provider, modelId: entry.modelId };
		else if (entry.type === "message" && entry.message.role === "assistant") {
			model = { provider: entry.message.provider, modelId: entry.message.model };
		}
		appendMessage(messages, entry);
	}

	return { messages, thinkingLevel, model };
}

// Strip the executor's in-flight advisor() toolCall from the tail assistant
// message. That call is what invoked *us* — there is no matching toolResult
// yet, and providers (Anthropic, GLM/zai, OpenAI) reject payloads with orphan
// toolCalls. Name-targeted to leave any other trailing toolCalls visible.
export function stripInflightAdvisorCall(messages: Message[]): Message[] {
	if (messages.length === 0) return messages;
	const last = messages[messages.length - 1];
	if (!last || last.role !== "assistant" || !Array.isArray(last.content)) return messages;
	const filtered = last.content.filter((content) => !isInflightAdvisorToolCall(content));
	if (filtered.length === last.content.length) return messages;
	if (filtered.length === 0) return messages.slice(0, -1);
	return [...messages.slice(0, -1), { ...last, content: filtered } as Message];
}

// Some providers (recent Anthropic Claude models) reject payloads ending on an
// assistant turn ("This model does not support assistant message prefill. The
// conversation must end with a user message."). After stripInflightAdvisorCall
// the tail can be assistant (e.g. the executor wrote thinking text before
// calling advisor). Append a minimal user-role nudge to guarantee user-tail.
export function ensureUserTailForAdvisor(messages: Message[]): Message[] {
	if (messages.length === 0) return messages;
	const last = messages[messages.length - 1];
	if (!last || last.role !== "assistant") return messages;
	const nudge: Message = {
		role: "user",
		content: [{ type: "text", text: MSG_ADVISOR_NUDGE }],
		timestamp: Date.now(),
	};
	return [...messages, nudge];
}
