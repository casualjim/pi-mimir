import { createHash } from "node:crypto";
import type { ContextEvent, ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Box, Text } from "@earendil-works/pi-tui";
import {
	applyCompressionResult,
	buildCompressionPayload,
	convertMessage,
	extractOpenAIText,
} from "./bridge.js";
import { HeadroomHttpClient } from "./client.js";
import { Type } from "typebox";
import { detectHeadroomHost, isRemoteBlocked, loadHeadroomConfig, resolveHeadroomSettingsFile, saveHeadroomSettings } from "./config.js";
import type { AgentMessage, CompressResult, CompressionPayload, HeadroomConfig, HeadroomMode, HeadroomStats } from "./types.js";

const STATUS_KEY = "headroom";
const SUBCOMMANDS = ["status", "on", "off", "health", "stats", "mode"] as const;
const MODES = ["normal", "quiet", "silent"] as const;
const NOTRACE_TELEMETRY_CHANNEL = "notrace.telemetry.extension";
// Bounded FIFO, not config: this is a safety valve for duplicate-compression loops.
// 512 hashes covers roughly 256 compressed candidates because we store original + compressed text hashes.
// That is far beyond the reread-loop case while keeping memory bounded for long sessions.
const MAX_SEEN_CANDIDATE_CONTENT_FINGERPRINTS = 512;

type Subcommand = (typeof SUBCOMMANDS)[number];

interface HeadroomRuntimeState {
	enabled: boolean;
	proxyOnline: boolean | null;
	remoteWarningShown: boolean;
	offlineWarningShown: boolean;
	processing: boolean;
	lastInputFingerprint: string | null;
	lastOutputFingerprint: string | null;
	lastGuardSkipCandidateFingerprint: string | null;
	seenCandidateContentFingerprints?: Set<string>;
	seenCandidateContentOrder?: string[];
	lastCompressionTime: number;
	stats: HeadroomStats;
}

interface HeadroomRuntime {
	pi: ExtensionAPI;
	config: HeadroomConfig;
	client: HeadroomHttpClient;
	state: HeadroomRuntimeState;
	/** Resolved settings file for this host (pi or omp). */
	settingsFile: string;
	refreshStatus(ctx: ExtensionContext): void;
	updateHealth(ctx: ExtensionContext): Promise<boolean>;
	ensureProxy(ctx: ExtensionContext): Promise<boolean>;
}

const COMPRESSION_ENTRY_TYPE = "noheadroom.compression";

interface CompressionEntryDetails {
	tokensBefore: number;
	tokensAfter: number;
	tokensSaved: number;
	compressionRatio: number;
	appliedMessages: number;
	transformsApplied: string[];
	timestamp: number;
}

export default function headroomExtension(pi: ExtensionAPI) {
	registerCompressionRenderer(pi);
	const runtime = createRuntime(pi);

	pi.on("session_start", (_event, ctx) => {
		if (isRemoteBlocked(runtime.config)) {
			runtime.refreshStatus(ctx);
			emitNotraceTelemetry(runtime);
			ctx.ui.notify(
				`Headroom remote URL is blocked by default: ${runtime.config.baseUrl}\nSet PI_HEADROOM_ALLOW_REMOTE=1 only if you trust that proxy with full context.`,
				"warning",
			);
			return;
		}
		runtime.refreshStatus(ctx);
		emitNotraceTelemetry(runtime);
		if (!runtime.state.enabled) return;
		void ensureProxyInBackground(runtime, ctx);
	});

	pi.on("context", (event, ctx) => handleContextCompression(runtime, event, ctx));

	pi.registerCommand("headroom", {
		description: "Headroom token compression. Usage: /headroom [on|off|status|health|stats|mode <normal|quiet|silent>]",
		getArgumentCompletions(argumentPrefix) {
			const parts = argumentPrefix.trim().toLowerCase().split(/\s+/);
			if (parts[0] === "mode") {
				const modePfx = parts[1] ?? "";
				return MODES.filter((m) => m.startsWith(modePfx)).map((m) => ({
					value: `mode ${m}`,
					label: `mode ${m}`,
				}));
			}
			const prefix = parts[0] ?? "";
			return SUBCOMMANDS.filter((command) => command.startsWith(prefix)).map((command) => ({
				value: command,
				label: command,
			}));
		},
		handler: async (args, ctx) => {
			const parts = args.trim().split(/\s+/);
			const first = (parts[0] ?? "").toLowerCase();
			if (first === "mode") {
				return handleModeChange(runtime, parts[1]?.toLowerCase() ?? "", ctx);
			}
			return handleCommand(runtime, parseSubcommand(first), ctx);
		},
	});

	pi.registerCommand("headroom-health", {
		description: "Check Headroom proxy health",
		handler: async (_args, ctx) => {
			await handleCommand(runtime, "health", ctx);
		},
	});

	const retrieveTool = {
		name: "headroom_retrieve",
		label: "Headroom Retrieve",
		description:
			"Retrieve the full original content that Headroom compressed. Use the exact hash from a compression marker " +
			"(e.g. `Retrieve more: hash=...`, `Retrieve original: hash=...`) or from a `<<ccr:hash ...>>` machine marker in a tool result.",
		parameters: Type.Object({
			hash: Type.String({ description: "The exact hash from the compression marker (12-24 hex characters)" }),
		}),
		// omp defaults extension tools to loadMode "discoverable" and approval "exec";
		// a marker-redeeming tool must stay top-level and read-only. pi ignores both fields.
		loadMode: "essential" as const,
		approval: "read" as const,
		async execute(_toolCallId: string, params: { hash?: unknown }, signal: AbortSignal | undefined) {
			const hash = String(params.hash ?? "").trim().toLowerCase();
			if (!/^[a-f0-9]{12,24}$/.test(hash)) {
				return {
					content: [
						{
							type: "text" as const,
							text: JSON.stringify({ error: "Invalid hash format. Expected 12-24 hex characters." }),
						},
					],
					details: { hash, ok: false },
				};
			}
			const result = await runtime.client.retrieve(hash, signal);
			return {
				content: [
					{
						type: "text" as const,
						text: result.ok ? result.content : JSON.stringify({ error: result.error, hash }),
					},
				],
				details: { hash, ok: result.ok },
			};
		},
	};
	pi.registerTool(retrieveTool);
}

function createRuntime(pi: ExtensionAPI): HeadroomRuntime {
	const host = detectHeadroomHost(pi);
	const settingsFile = resolveHeadroomSettingsFile(host);
	const config = loadHeadroomConfig(process.env, undefined, host);
	const client = new HeadroomHttpClient({ baseUrl: config.baseUrl, timeoutMs: config.timeoutMs });
	const state: HeadroomRuntimeState = {
		enabled: config.enabled,
		proxyOnline: null,
		remoteWarningShown: false,
		offlineWarningShown: false,
		processing: false,
		lastInputFingerprint: null,
		lastOutputFingerprint: null,
		lastGuardSkipCandidateFingerprint: null,
		seenCandidateContentFingerprints: new Set(),
		seenCandidateContentOrder: [],
		lastCompressionTime: 0,
		stats: { attempts: 0, applied: 0, guardSkips: 0, tokensSaved: 0 },
	};

	const runtime: HeadroomRuntime = {
		pi,
		config,
		client,
		state,
		settingsFile,
		refreshStatus(ctx) {
			refreshStatus(ctx, runtime.config, runtime.state);
		},
		async updateHealth(ctx) {
			const online = await updateHealthState(runtime, ctx.signal);
			runtime.refreshStatus(ctx);
			return online;
		},
		async ensureProxy(ctx) {
			return ensureProxy(runtime, ctx);
		},
	};
	return runtime;
}

async function updateHealthState(runtime: HeadroomRuntime, signal?: AbortSignal): Promise<boolean> {
	if (isRemoteBlocked(runtime.config)) return false;
	if (await runtime.client.health(signal)) {
		runtime.state.proxyOnline = true;
	} else {
		runtime.state.proxyOnline = await runtime.client.probe(signal);
	}
	return runtime.state.proxyOnline;
}

async function ensureProxy(runtime: HeadroomRuntime, ctx: ExtensionContext): Promise<boolean> {
	return runtime.updateHealth(ctx);
}

async function ensureProxyInBackground(runtime: HeadroomRuntime, ctx?: ExtensionContext): Promise<void> {
	try {
		await updateHealthState(runtime);
	} catch (error) {
		runtime.state.proxyOnline = false;
		runtime.state.stats.lastError = error instanceof Error ? error.message : String(error);
	}
	safeRefreshStatus(runtime, ctx);
}

function safeRefreshStatus(runtime: HeadroomRuntime, ctx: ExtensionContext | undefined): void {
	if (!ctx) return;
	try {
		runtime.refreshStatus(ctx);
	} catch {
		// The session may have been reloaded/replaced while background health was in flight.
	}
}

function registerCompressionRenderer(pi: ExtensionAPI): void {
	pi.registerMessageRenderer(COMPRESSION_ENTRY_TYPE, (message, { expanded }, theme) => {
		const details = message.details as (CompressionEntryDetails & { summary?: string }) | undefined;
		const content = details?.summary ?? (typeof message.content === "string" ? message.content : "headroom compression applied");
		const box = new Box(1, 1, (text) => theme.bg("customMessageBg", text));
		let text = `${theme.fg("success", "🗜 headroom")} ${content}`;
		if (expanded && details) {
			text += `\n${theme.fg("dim", `  before: ${details.tokensBefore.toLocaleString()} tokens`)}`;
			text += `\n${theme.fg("dim", `  after:  ${details.tokensAfter.toLocaleString()} tokens`)}`;
			text += `\n${theme.fg("dim", `  saved:  ${details.tokensSaved.toLocaleString()} tokens`)}`;
			text += `\n${theme.fg("dim", `  messages: ${details.appliedMessages}`)}`;
			text += `\n${theme.fg("dim", `  transforms: ${details.transformsApplied.join(", ") || "none"}`)}`;
		}
		box.addChild(new Text(text, 0, 0));
		return box;
	});
}

async function handleContextCompression(
	runtime: HeadroomRuntime,
	event: ContextEvent,
	ctx: ExtensionContext,
): Promise<{ messages?: AgentMessage[] } | undefined> {
	if (runtime.state.processing) return undefined;

	const bypassUncompressed = () => {
		if (runtime.state.stats.last) {
			runtime.state.stats.last = undefined;
			runtime.refreshStatus(ctx);
		}
		return undefined;
	};

	// Throttle: max 1 compression attempt per 3 seconds to kill infinite loops
	const now = Date.now();
	if (now - runtime.state.lastCompressionTime < 3000) {
		return bypassUncompressed();
	}

	// Content-based guards to prevent infinite recursion
	const inputFingerprint = generateFingerprint(event.messages);

	// 1. If this input matches our previous output, we already compressed it. Stop.
	if (runtime.state.lastOutputFingerprint === inputFingerprint) {
		return undefined;
	}

	// 2. If this input matches our previous input, it didn't change. Stop.
	if (runtime.state.lastInputFingerprint === inputFingerprint) {
		return bypassUncompressed();
	}

	if (shouldSkipBeforePayload(runtime, ctx)) return bypassUncompressed();
	const payload = buildCompressionPayload(event.messages, runtime.config.minMessageChars, {
		renameToolCalls: runtime.config.renameToolCalls,
	});
	if (payload.candidateCount === 0) return bypassUncompressed();

	// 3. If eligible candidates haven't changed since the last skip/no-savings result,
	// don't spend another proxy call just because surrounding conversation changed.
	const candidateFingerprint = generateCandidateFingerprint(event.messages, payload);
	if (runtime.state.lastGuardSkipCandidateFingerprint === candidateFingerprint) {
		return bypassUncompressed();
	}
	if (allCandidateContentSeen(runtime.state, payload)) {
		return bypassUncompressed();
	}
	ignoreSeenCandidateContent(runtime.state, payload);
	if (runtime.state.proxyOnline !== true) {
		void ensureProxyInBackground(runtime, ctx);
		return bypassUncompressed();
	}

	runtime.state.processing = true;
	runtime.state.lastCompressionTime = now;
	runtime.state.stats.attempts++;
	try {
		const result = await runtime.client.compress(payload.messages, ctx.model?.id, ctx.signal);
		runtime.state.proxyOnline = true;
		if (!result.compressed || result.tokensSaved <= 0) {
			// Even if no tokens saved, record fingerprints so we don't keep trying
			// until the actual compressible candidate material changes.
			runtime.state.lastInputFingerprint = inputFingerprint;
			runtime.state.lastGuardSkipCandidateFingerprint = candidateFingerprint;
			return bypassUncompressed();
		}

		const applied = applyCompressionResult(event.messages, payload.mappings, result.messages, {
			minMessageChars: runtime.config.minMessageChars,
		});
		if (!applied.ok) {
			// Record the input even on guard skips to prevent looping retries for this context
			runtime.state.lastInputFingerprint = inputFingerprint;
			runtime.state.lastOutputFingerprint = null;
			runtime.state.lastGuardSkipCandidateFingerprint = candidateFingerprint;

			recordGuardSkip(runtime.state.stats, applied.reason);
			emitNotraceTelemetry(runtime);
			announceGuardSkip(ctx, applied.reason, result, runtime.config.mode);
			return bypassUncompressed();
		}

		// Store fingerprints to break the feedback loop
		runtime.state.lastInputFingerprint = inputFingerprint;
		runtime.state.lastOutputFingerprint = generateFingerprint(applied.messages);
		runtime.state.lastGuardSkipCandidateFingerprint = null;
		recordSeenCandidateContent(runtime.state, payload, applied.messages);
		const appliedResult = {
			...result,
			tokensBefore: applied.appliedTokensBefore,
			tokensAfter: applied.appliedTokensAfter,
			tokensSaved: applied.appliedTokensSaved,
			compressionRatio: applied.appliedCompressionRatio,
		};

		recordAppliedCompression(runtime.state.stats, appliedResult, applied.appliedMessages);
		emitNotraceTelemetry(runtime);
		announceAppliedCompression(ctx, appliedResult, applied.appliedMessages, runtime.config.mode);
		runtime.refreshStatus(ctx);
		return { messages: applied.messages };
	} catch (error) {
		recordCompressionError(runtime, ctx, error);
		return bypassUncompressed();
	} finally {
		runtime.state.processing = false;
	}
}

function allCandidateContentSeen(state: HeadroomRuntimeState, payload: CompressionPayload): boolean {
	const seen = state.seenCandidateContentFingerprints;
	if (!seen?.size) return false;
	const hashes = payload.mappings.filter((mapping) => mapping.applyTo).map((mapping) => stableHash(mapping.originalText));
	return hashes.length > 0 && hashes.every((hash) => seen.has(hash));
}

function ignoreSeenCandidateContent(state: HeadroomRuntimeState, payload: CompressionPayload): void {
	const seen = state.seenCandidateContentFingerprints;
	if (!seen?.size) return;
	for (const mapping of payload.mappings) {
		if (mapping.applyTo && seen.has(stableHash(mapping.originalText))) mapping.applyTo = null;
	}
}

function recordSeenCandidateContent(
	state: HeadroomRuntimeState,
	payload: CompressionPayload,
	appliedMessages: AgentMessage[],
): void {
	state.seenCandidateContentFingerprints ??= new Set();
	state.seenCandidateContentOrder ??= [];
	payload.mappings.forEach((mapping) => {
		if (!mapping.applyTo) return;
		addSeenCandidateHash(state, stableHash(mapping.originalText));
		const applied = convertMessage(appliedMessages[mapping.sourceIndex]);
		if (applied) addSeenCandidateHash(state, stableHash(extractOpenAIText(applied)));
	});
}

function addSeenCandidateHash(state: HeadroomRuntimeState, hash: string): void {
	state.seenCandidateContentFingerprints ??= new Set();
	state.seenCandidateContentOrder ??= [];
	if (state.seenCandidateContentFingerprints.has(hash)) return;
	state.seenCandidateContentFingerprints.add(hash);
	state.seenCandidateContentOrder.push(hash);
	while (state.seenCandidateContentOrder.length > MAX_SEEN_CANDIDATE_CONTENT_FINGERPRINTS) {
		const oldest = state.seenCandidateContentOrder.shift();
		if (oldest) state.seenCandidateContentFingerprints.delete(oldest);
	}
}

function generateCandidateFingerprint(messages: AgentMessage[], payload: CompressionPayload): string {
	const units = payload.mappings
		.filter((mapping) => mapping.applyTo)
		.map((mapping) => {
			const source = messages[mapping.sourceIndex] as AgentMessage & {
				content?: unknown;
				toolCallId?: unknown;
				toolName?: unknown;
			};
			return {
				applyTo: mapping.applyTo,
				sourceIndex: mapping.sourceIndex,
				role: source.role,
				toolCallId: typeof source.toolCallId === "string" ? source.toolCallId : null,
				toolName: typeof source.toolName === "string" ? source.toolName : null,
				contentShape: describeContentShape(source.content),
				textLength: mapping.originalText.length,
				textHash: stableHash(mapping.originalText),
			};
		});
	return stableHash(JSON.stringify(units));
}

function describeContentShape(content: unknown): string {
	if (Array.isArray(content)) {
		return content
			.map((part) => {
				if (!part || typeof part !== "object" || !("type" in part)) return "unknown";
				return String((part as { type?: unknown }).type ?? "unknown");
			})
			.join(",");
	}
	return typeof content;
}

function stableHash(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function generateFingerprint(messages: AgentMessage[]): string {
	return messages
		.map((m) => {
			const converted = convertMessage(m);
			const text = converted ? extractOpenAIText(converted) : "";
			return `${m.role}:${text.length}:${stableHash(text)}`;
		})
		.join(",");
}

function shouldSkipBeforePayload(runtime: HeadroomRuntime, ctx: ExtensionContext): boolean {
	if (!runtime.state.enabled) return true;
	if (isRemoteBlocked(runtime.config)) {
		if (!runtime.state.remoteWarningShown) {
			runtime.state.remoteWarningShown = true;
			ctx.ui.notify("Headroom compression skipped because remote proxy is blocked.", "warning");
		}
		runtime.refreshStatus(ctx);
		return true;
	}
	const usage = ctx.getContextUsage();
	return usage?.tokens !== null && usage?.tokens !== undefined && usage.tokens < runtime.config.minContextTokens;
}

function recordGuardSkip(stats: HeadroomStats, reason: string): void {
	stats.guardSkips++;
	stats.lastSkipReason = reason;
}

function recordAppliedCompression(stats: HeadroomStats, result: CompressResult, appliedMessages: number): void {
	stats.applied++;
	stats.tokensSaved += result.tokensSaved;
	stats.lastError = undefined;
	stats.lastSkipReason = undefined;
	stats.last = { ...result, appliedMessages };
}

function summarizeTelemetry(state: HeadroomRuntimeState): string | null {
	if (state.stats.last) {
		const pct = Math.round((1 - state.stats.last.compressionRatio) * 100);
		return `last compression estimated about ${state.stats.last.tokensSaved.toLocaleString()} tokens saved (-${pct}%) across ${state.stats.last.appliedMessages} tool results; local session estimate about ${state.stats.tokensSaved.toLocaleString()} tokens saved`;
	}
	if (!state.enabled) return "headroom loaded but disabled for this session";
	if (state.stats.lastSkipReason) return `compression not applied; last guard skip: ${state.stats.lastSkipReason}`;
	if (state.stats.lastError) return `compression unavailable; last error: ${state.stats.lastError}`;
	if (state.proxyOnline === false) return "proxy unavailable";
	return "headroom loaded; no compression applied yet";
}

function emitNotraceTelemetry(runtime: HeadroomRuntime): void {
	const state = runtime.state;
	const status = !state.enabled
		? "loaded-disabled"
		: state.stats.last
			? "active"
			: "loaded-inactive";
	const details: Record<string, unknown> = {
		attempts: state.stats.attempts,
		applied: state.stats.applied,
		guardSkips: state.stats.guardSkips,
		tokensSaved: state.stats.tokensSaved,
		proxyOnline: state.proxyOnline,
		lastSkipReason: state.stats.lastSkipReason,
		lastError: state.stats.lastError,
	};
	if (state.stats.last) details.last = { ...state.stats.last };
	try {
		runtime.pi.events.emit(NOTRACE_TELEMETRY_CHANNEL, {
			extension: "noheadroom",
			loaded: true,
			enabled: state.enabled,
			active: Boolean(state.stats.last),
			status,
			summary: summarizeTelemetry(state),
			details,
		});
	} catch {
		// Telemetry should never break compression behavior.
	}
}

function announceAppliedCompression(
	ctx: ExtensionContext,
	result: CompressResult,
	appliedMessages: number,
	mode: HeadroomMode = "normal",
): void {
	if (mode === "quiet" || mode === "silent") return;
	const pct = Math.round((1 - result.compressionRatio) * 100);
	const summary = `compressed ${appliedMessages} tool results; estimated ~${result.tokensSaved.toLocaleString()} tokens saved (-${pct}%)`;
	const line = `headroom: ${summary}`;
	ctx.ui.notify(line, "info");
	// Note: we no longer use pi.appendEntry or pi.sendMessage here because
	// modifying the session history inside the context event triggers an infinite loop.
	// Non-interactive `pi -p` does not always show footer/status UI, so print an explicit proof line.
	// In interactive Pi TUI, writing to stderr during the context hook can leave a stale "Working..." row.
	if (!ctx.hasUI) process.stderr.write(`🗜 ${line}\n`);
}

function announceGuardSkip(ctx: ExtensionContext, reason: string, result: CompressResult, mode: HeadroomMode = "normal"): void {
	if (mode === "silent") return;
	const line = `headroom: compression skipped by guard (${reason}); Headroom reported ${result.tokensSaved.toLocaleString()} tokens saved but Pi context was left unchanged`;
	ctx.ui.notify(line, "warning");
	// In interactive Pi TUI, writing to stderr during the context hook can leave a stale "Working..." row.
	if (!ctx.hasUI) process.stderr.write(`⚠ ${line}\n`);
}

function recordCompressionError(runtime: HeadroomRuntime, ctx: ExtensionContext, error: unknown): void {
	runtime.state.stats.lastError = getErrorMessage(error);
	if (isAbortOrTimeoutError(error)) {
		emitNotraceTelemetry(runtime);
		runtime.refreshStatus(ctx);
		return;
	}

	runtime.state.proxyOnline = false;
	if (!runtime.state.offlineWarningShown) {
		runtime.state.offlineWarningShown = true;
		ctx.ui.notify(
			`Headroom proxy unavailable. Compression disabled until /headroom health succeeds.\n${runtime.state.stats.lastError}`,
			"warning",
		);
	}
	emitNotraceTelemetry(runtime);
	runtime.refreshStatus(ctx);
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function isAbortOrTimeoutError(error: unknown): boolean {
	if (!error || typeof error !== "object") return false;
	const candidate = error as { cause?: unknown; message?: unknown; name?: unknown };
	if (candidate.name === "TimeoutError" || candidate.name === "AbortError") return true;
	if (
		typeof candidate.message === "string" &&
		/aborted due to timeout|operation was aborted/i.test(candidate.message)
	) {
		return true;
	}
	return candidate.cause !== undefined && candidate.cause !== error && isAbortOrTimeoutError(candidate.cause);
}

async function handleCommand(runtime: HeadroomRuntime, command: Subcommand, ctx: ExtensionContext): Promise<void> {
	if (command === "on") {
		runtime.state.enabled = true;
		runtime.state.offlineWarningShown = false;
		const healthy = await runtime.ensureProxy(ctx);
		emitNotraceTelemetry(runtime);
		ctx.ui.notify(
			healthy ? "Headroom compression enabled." : proxyStartHint(runtime.config),
			healthy ? "info" : "warning",
		);
		return;
	}
	if (command === "off") {
		runtime.state.enabled = false;
		emitNotraceTelemetry(runtime);
		runtime.refreshStatus(ctx);
		ctx.ui.notify("Headroom compression disabled for this Pi session.", "info");
		return;
	}
	if (command === "health") {
		const healthy = await runtime.ensureProxy(ctx);
		emitNotraceTelemetry(runtime);
		ctx.ui.notify(
			healthy ? `Headroom proxy online: ${runtime.config.baseUrl}` : proxyStartHint(runtime.config),
			healthy ? "info" : "warning",
		);
		return;
	}
	if (command === "stats") {
		await showProxyStats(ctx, runtime.client, runtime.config);
		return;
	}
	ctx.ui.notify(renderStatus(runtime.config, runtime.state), "info");
}

async function handleModeChange(runtime: HeadroomRuntime, rawMode: string, ctx: ExtensionContext): Promise<void> {
	const VALID_MODES: HeadroomMode[] = ["normal", "quiet", "silent"];
	if (!VALID_MODES.includes(rawMode as HeadroomMode)) {
		ctx.ui.notify(
			`Unknown mode "${rawMode}". Valid modes: ${VALID_MODES.join(", ")}\nUsage: /headroom mode <normal|quiet|silent>`,
			"warning",
		);
		return;
	}
	const mode = rawMode as HeadroomMode;
	runtime.config.mode = mode;
	saveHeadroomSettings({ mode }, runtime.settingsFile);
	emitNotraceTelemetry(runtime);
	ctx.ui.notify(`Headroom output mode set to "${mode}" and saved to settings.`, "info");
}

function refreshStatus(ctx: ExtensionContext, config: HeadroomConfig, state: HeadroomRuntimeState): void {
	if (!ctx.hasUI) return;
	ctx.ui.setStatus(STATUS_KEY, renderFooterStatus(ctx, config, state));
}

type HeadroomStatusColor = "dim" | "warning" | "success";

type HeadroomStatusTheme = {
	fg(color: HeadroomStatusColor, text: string): string;
};

function isHeadroomStatusTheme(theme: unknown): theme is HeadroomStatusTheme {
	return typeof (theme as { fg?: unknown } | null)?.fg === "function";
}

function createStatusPainter(theme: unknown): (color: HeadroomStatusColor, text: string) => string {
	if (isHeadroomStatusTheme(theme)) return (color, text) => theme.fg(color, text);
	return (_color, text) => text;
}

function renderFooterStatus(ctx: ExtensionContext, config: HeadroomConfig, state: HeadroomRuntimeState): string {
	const paint = createStatusPainter(ctx.ui.theme);
	if (!state.enabled) return paint("dim", "○ Headroom off");
	if (isRemoteBlocked(config)) return paint("warning", "⚠") + paint("dim", " Headroom remote blocked");
	if (state.proxyOnline === false) return paint("dim", "○ Headroom not running");
	if (state.proxyOnline === null && !state.stats.last) return paint("dim", "○ Headroom idle");
	return paint("success", "✓") + paint("dim", " Headroom active");
}

async function showProxyStats(
	ctx: ExtensionContext,
	client: HeadroomHttpClient,
	config: HeadroomConfig,
): Promise<void> {
	if (isRemoteBlocked(config)) {
		ctx.ui.notify(renderRemoteBlocked(config), "warning");
		return;
	}
	try {
		const stats = await client.stats(ctx.signal);
		ctx.ui.notify(
			`Headroom proxy stats (${config.baseUrl}):\n${JSON.stringify(stats, null, 2).slice(0, 4000)}`,
			"info",
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		ctx.ui.notify(`Could not read Headroom stats: ${message}`, "warning");
	}
}

function renderStatus(config: HeadroomConfig, state: HeadroomRuntimeState): string {
	const stats = state.stats;
	const lines = [
		"Headroom token compression",
		`  Enabled: ${state.enabled ? "yes" : "no"}`,
		`  Proxy:   ${config.baseUrl} (${state.proxyOnline === true ? "online" : state.proxyOnline === false ? "not running" : "unknown"})`,
		`  Remote:  ${isRemoteBlocked(config) ? "blocked" : config.allowRemote ? "allowed" : "local-only"}`,
		`  Mode:    ${config.mode}`,
		`  Thresholds: context >= ${config.minContextTokens.toLocaleString()} tokens, toolResult >= ${config.minMessageChars.toLocaleString()} chars`,
		"",
		"Session stats:",
		`  Attempts:     ${stats.attempts}`,
		`  Applied:      ${stats.applied}`,
		`  Guard skips:  ${stats.guardSkips}`,
		`  Estimated tokens saved: ~${stats.tokensSaved.toLocaleString()}`,
		`  Note: local estimate; proxy /stats does not track Pi extension /v1/compress calls.`,
	];
	if (stats.last) {
		const pct = Math.round((1 - stats.last.compressionRatio) * 100);
		lines.push(
			"",
			"Last applied compression:",
			`  ${stats.last.tokensBefore.toLocaleString()} → ${stats.last.tokensAfter.toLocaleString()} tokens (-${pct}%)`,
			`  Applied messages: ${stats.last.appliedMessages}`,
			`  Transforms: ${stats.last.transformsApplied.join(", ") || "none"}`,
			`  CCR hashes: ${stats.last.ccrHashes.length}`,
		);
	}
	if (stats.lastSkipReason) lines.push("", `Last guard skip: ${stats.lastSkipReason}`);
	if (stats.lastError) lines.push("", `Last error: ${stats.lastError}`);
	return lines.join("\n");
}

function proxyStartHint(config: HeadroomConfig): string {
	if (isRemoteBlocked(config)) return renderRemoteBlocked(config);
	return [
		`Headroom proxy is not reachable: ${config.baseUrl}`,
		"This extension never starts the proxy; run it yourself:",
		`  ${renderManualProxyCommand(config)}`,
	].join("\n");
}

function renderManualProxyCommand(config: HeadroomConfig): string {
	try {
		const url = new URL(config.baseUrl);
		const host = url.hostname === "localhost" ? "127.0.0.1" : url.hostname.replace(/^\[(.*)]$/, "$1");
		const port = url.port || "8787";
		return `headroom proxy --host ${host} --port ${port} --mode token --no-cache`;
	} catch {
		return "headroom proxy --mode token --no-cache";
	}
}

function renderRemoteBlocked(config: HeadroomConfig): string {
	return [
		`Headroom remote URL is blocked: ${config.baseUrl}`,
		"Compression sends conversation context to the proxy.",
		"Set PI_HEADROOM_ALLOW_REMOTE=1 only for a trusted proxy.",
	].join("\n");
}

function parseSubcommand(args: string): Subcommand {
	const normalized = args.trim().toLowerCase();
	return SUBCOMMANDS.includes(normalized as Subcommand) ? (normalized as Subcommand) : "status";
}

export const __test__ = {
	isAbortOrTimeoutError,
	renderFooterStatus,
	generateFingerprint,
	handleContextCompression,
};
