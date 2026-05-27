import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Api, Model, ThinkingLevel } from "@earendil-works/pi-ai";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import {
	type AgentToolResult,
	type AgentToolUpdateCallback,
	type ExtensionAPI,
	type ExtensionContext,
	SessionManager,
} from "@earendil-works/pi-coding-agent";
import type { SelectItem } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { showAdvisorPicker, showEffortPicker } from "./advisor-ui.js";

export const ADVISOR_TOOL_NAME = "advisor";
const TOOL_LABEL = "Advisor";
const NO_ADVISOR_VALUE = "__no_advisor__";
const OFF_VALUE = "__off__";
const CHECKMARK = " ✓";
const EFFORT_ORDINAL: readonly ThinkingLevel[] = ["minimal", "low", "medium", "high", "xhigh"];
const DEFAULT_EFFORT: ThinkingLevel = "high";
const RECOMMENDED_EFFORT_SUFFIX = "  (recommended)";
const MSG_REQUIRES_INTERACTIVE = "/advisor requires interactive mode";
const MSG_ADVISOR_DISABLED = "Advisor disabled";
const MSG_PERSIST_FAILED = "Failed to save advisor selection — selection not persisted";
const ERR_NO_MODEL = "No advisor model is configured. The user can enable one with the /advisor command.";
const ERR_NO_MODEL_SELECTED = "no advisor model selected";
const ERR_EMPTY_RESPONSE = "Advisor returned no text content.";
const ERR_EMPTY_RESPONSE_DETAIL = "empty response";
const ERR_UNKNOWN = "unknown error";
const ADVISOR_PROMPT_SNIPPET = "Consult a forked advisor child session for plan, correction, or stop guidance";
const ADVISOR_PROMPT_GUIDELINES = [
	"Use `advisor` when you need stronger judgment on a complex decision, ambiguous failure, or uncertain direction.",
	"Use `advisor` before committing to a risky approach or before declaring the task done when a second opinion would materially help.",
	"Do not pass parameters to `advisor`; it automatically forks from the current branch context and returns concise guidance.",
];

const errSelectionNotFound = (choice: string) => `Advisor selection not found: ${choice}`;
const errModelUnavailable = (key: string) => `Previously configured advisor model ${key} is no longer available`;
const errMisconfigured = (label: string, err: string) => `Advisor (${label}) is misconfigured: ${err}`;
const errNoApiKey = (label: string) => `Advisor (${label}) has no API key available.`;
const errNoApiKeyDetail = (provider: string) => `no API key for ${provider}`;
const errCallFailed = (err: string | undefined) => `Advisor call failed: ${err ?? ERR_UNKNOWN}`;
const errCallThrew = (msg: string) => `Advisor call threw: ${msg}`;
const msgAdvisorEnabled = (label: string, effort: ThinkingLevel | undefined) => `Advisor: ${label}${effort ? `, ${effort}` : ""}`;
const msgAdvisorEnabledInactive = (label: string, effort: ThinkingLevel | undefined) =>
	`Advisor: ${label}${effort ? `, ${effort}` : ""} (inactive for current executor)`;
const msgAdvisorRestored = (label: string, effort: ThinkingLevel | undefined) => `Advisor restored: ${label}${effort ? `, ${effort}` : ""}`;
const msgAdvisorRestoredInactive = (label: string, effort: ThinkingLevel | undefined) =>
	`Advisor restored: ${label}${effort ? `, ${effort}` : ""} (inactive for current executor)`;
const msgConsulting = (label: string, effort: ThinkingLevel | undefined) =>
	`Consulting advisor (${label}${effort ? `, ${effort}` : ""})…`;

const PACKAGE_ROOT = (() => {
	const thisFile = fileURLToPath(import.meta.url);
	return dirname(dirname(dirname(thisFile)));
})();
const BUNDLED_ADVISOR_AGENT_PATH = join(PACKAGE_ROOT, "agents", "advisor-child.md");

function advisorConfigPath(): string {
	const baseHome = process.env.PI_MIMIR_ADVISOR_HOME || homedir();
	return join(baseHome, ".config", "pi-mimir-advisor", "advisor.json");
}

interface AdvisorConfig {
	modelKey?: string;
	effort?: ThinkingLevel;
	disabledForModels?: Array<string | { model: string; minEffort?: ThinkingLevel }>;
}

interface AdvisorAgentConfig {
	inheritProjectContext: boolean;
	inheritSkills: boolean;
	systemPromptMode: "append" | "replace";
	tools: string[];
	systemPrompt: string;
}

export interface AdvisorDetails {
	advisorModel?: string;
	effort?: ThinkingLevel;
	errorMessage?: string;
	childSessionFile?: string;
}

const AdvisorParams = Type.Object({});

let selectedAdvisor: Model<Api> | undefined;
let selectedAdvisorEffort: ThinkingLevel | undefined;
let disabledForModelsCache: Array<string | { model: string; minEffort?: ThinkingLevel }> = [];

export function getAdvisorModel(): Model<Api> | undefined {
	return selectedAdvisor;
}

export function setAdvisorModel(model: Model<Api> | undefined): void {
	selectedAdvisor = model;
}

export function getAdvisorEffort(): ThinkingLevel | undefined {
	return selectedAdvisorEffort;
}

export function setAdvisorEffort(effort: ThinkingLevel | undefined): void {
	selectedAdvisorEffort = effort;
}

export function setDisabledForModels(models: Array<string | { model: string; minEffort?: ThinkingLevel }>): void {
	disabledForModelsCache = models;
}

function ensureConfigDir(): void {
	mkdirSync(dirname(advisorConfigPath()), { recursive: true });
}

export function loadAdvisorConfig(): AdvisorConfig {
	const configPath = advisorConfigPath();
	if (!existsSync(configPath)) return {};
	try {
		const parsed = JSON.parse(readFileSync(configPath, "utf-8"));
		return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as AdvisorConfig) : {};
	} catch {
		return {};
	}
}

function validateDisabledForModels(value: unknown): Array<string | { model: string; minEffort?: ThinkingLevel }> {
	if (!Array.isArray(value)) return [];
	return value.filter((entry): entry is string | { model: string; minEffort?: ThinkingLevel } => {
		if (typeof entry === "string") return entry.length > 0;
		if (typeof entry !== "object" || entry === null) return false;
		const obj = entry as Record<string, unknown>;
		if (typeof obj.model !== "string" || obj.model.length === 0) return false;
		if (obj.minEffort !== undefined && !EFFORT_ORDINAL.includes(obj.minEffort as ThinkingLevel)) return false;
		return true;
	});
}

export function saveAdvisorConfig(key: string | undefined, effort: ThinkingLevel | undefined): boolean {
	const existing = loadAdvisorConfig();
	const config: AdvisorConfig = { ...existing };
	if (key) config.modelKey = key;
	else delete config.modelKey;
	if (effort) config.effort = effort;
	else delete config.effort;
	try {
		ensureConfigDir();
		const configPath = advisorConfigPath();
		writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf-8", mode: 0o600 });
		try {
			chmodSync(configPath, 0o600);
		} catch {
			// Best effort only.
		}
		return true;
	} catch {
		return false;
	}
}

function parseModelKey(key: string): { provider: string; modelId: string } | undefined {
	const idx = key.indexOf(":");
	if (idx < 1) return undefined;
	return { provider: key.slice(0, idx), modelId: key.slice(idx + 1) };
}

function modelKey(model: { provider: string; id: string }): string {
	return `${model.provider}:${model.id}`;
}

function isModelBlocked(model: Model<Api> | undefined, thinkingLevel?: string): boolean {
	if (!model) return false;
	const key = modelKey(model);
	for (const entry of disabledForModelsCache) {
		if (typeof entry === "string") {
			if (entry === key) return true;
			continue;
		}
		if (entry.model !== key) continue;
		if (entry.minEffort === undefined) return true;
		const thresholdOrdinal = EFFORT_ORDINAL.indexOf(entry.minEffort);
		const executorOrdinal = EFFORT_ORDINAL.indexOf(thinkingLevel as ThinkingLevel);
		if (executorOrdinal >= thresholdOrdinal) return true;
	}
	return false;
}

function isExecutorBlocked(ctx: ExtensionContext, thinkingLevel?: string): boolean {
	return isModelBlocked(ctx.model, thinkingLevel);
}

export function restoreAdvisorState(ctx: ExtensionContext, pi: ExtensionAPI): void {
	const config = loadAdvisorConfig();
	setDisabledForModels(validateDisabledForModels(config.disabledForModels));
	if (!config.modelKey) return;
	const parsed = parseModelKey(config.modelKey);
	if (!parsed) return;
	const model = ctx.modelRegistry.find(parsed.provider, parsed.modelId);
	if (!model) {
		if (ctx.hasUI) ctx.ui.notify(errModelUnavailable(config.modelKey), "warning");
		return;
	}
	setAdvisorModel(model);
	setAdvisorEffort(config.effort);
	if (isExecutorBlocked(ctx, pi.getThinkingLevel())) {
		if (ctx.hasUI) ctx.ui.notify(msgAdvisorRestoredInactive(modelKey(model), config.effort), "info");
		return;
	}
	const active = pi.getActiveTools();
	if (!active.includes(ADVISOR_TOOL_NAME)) {
		pi.setActiveTools([...active, ADVISOR_TOOL_NAME]);
	}
	if (ctx.hasUI) ctx.ui.notify(msgAdvisorRestored(modelKey(model), config.effort), "info");
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
	if (value === undefined) return fallback;
	return value.trim().toLowerCase() === "true";
}

function parseTools(value: string | undefined): string[] {
	if (!value) return [];
	return value.split(",").map((entry) => entry.trim()).filter(Boolean);
}

function loadAdvisorAgentConfig(): AdvisorAgentConfig {
	const raw = readFileSync(BUNDLED_ADVISOR_AGENT_PATH, "utf-8");
	const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
	if (!match) {
		return {
			inheritProjectContext: true,
			inheritSkills: false,
			systemPromptMode: "replace",
			tools: ["read", "grep", "find", "ls"],
			systemPrompt: raw.trim(),
		};
	}
	const frontmatter = match[1] ?? "";
	const body = match[2] ?? "";
	const fields = new Map<string, string>();
	for (const line of frontmatter.split("\n")) {
		const idx = line.indexOf(":");
		if (idx < 0) continue;
		fields.set(line.slice(0, idx).trim(), line.slice(idx + 1).trim());
	}
	return {
		inheritProjectContext: parseBoolean(fields.get("inheritProjectContext"), true),
		inheritSkills: parseBoolean(fields.get("inheritSkills"), false),
		systemPromptMode: fields.get("systemPromptMode") === "append" ? "append" : "replace",
		tools: parseTools(fields.get("tools")),
		systemPrompt: body.trim(),
	};
}

function createForkedSessionFile(ctx: ExtensionContext): string {
	const parentSessionFile = ctx.sessionManager.getSessionFile();
	if (!parentSessionFile) {
		throw new Error("Forked advisor context requires a persisted parent session.");
	}
	const leafId = ctx.sessionManager.getLeafId();
	if (!leafId) {
		throw new Error("Forked advisor context requires a current leaf to fork from.");
	}
	const sessionDir = ctx.sessionManager.getSessionDir?.();
	if (!existsSync(parentSessionFile)) {
		throw new Error(`Parent session file does not exist: ${parentSessionFile}. Pi has not persisted enough history to fork yet.`);
	}
	const sourceManager = SessionManager.open(parentSessionFile, sessionDir);
	const sessionFile = sourceManager.createBranchedSession(leafId);
	if (!sessionFile || !existsSync(sessionFile)) {
		throw new Error("Failed to create forked advisor session.");
	}
	return sessionFile;
}

function buildChildArgs(
	agent: AdvisorAgentConfig,
	sessionFile: string,
	model: Model<Api>,
	effort: ThinkingLevel | undefined,
	promptPath: string,
): string[] {
	const args = ["--mode", "text", "-p", "--session", sessionFile, "--model", `${model.provider}/${model.id}${effort ? `:${effort}` : ""}`];
	if (agent.tools.length > 0) {
		args.push("--tools", agent.tools.join(","));
	}
	if (!agent.inheritSkills) args.push("--no-skills");
	if (!agent.inheritProjectContext) args.push("--no-context-files");
	args.push(agent.systemPromptMode === "append" ? "--append-system-prompt" : "--system-prompt", promptPath);
	args.push("Task: Review the inherited parent branch context and return only PLAN, CORRECTION, or STOP guidance for the parent executor. Be concise and directive.");
	return args;
}

function buildErrorResult(advisorLabel: string | undefined, userText: string, errorMessage: string): AgentToolResult<AdvisorDetails> {
	const effort = getAdvisorEffort();
	return {
		content: [{ type: "text", text: userText }],
		details: advisorLabel ? { advisorModel: advisorLabel, effort, errorMessage } : { effort, errorMessage },
	};
}

function normalizeAdvisorText(text: string): string {
	return text.trim();
}

async function executeAdvisor(
	ctx: ExtensionContext,
	pi: ExtensionAPI,
	signal: AbortSignal | undefined,
	onUpdate: AgentToolUpdateCallback<AdvisorDetails> | undefined,
): Promise<AgentToolResult<AdvisorDetails>> {
	const advisor = getAdvisorModel();
	if (!advisor) return buildErrorResult(undefined, ERR_NO_MODEL, ERR_NO_MODEL_SELECTED);
	const advisorLabel = modelKey(advisor);
	const effort = getAdvisorEffort();
	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(advisor);
	if (!auth.ok) return buildErrorResult(advisorLabel, errMisconfigured(advisorLabel, auth.error), auth.error);
	if (!auth.apiKey) return buildErrorResult(advisorLabel, errNoApiKey(advisorLabel), errNoApiKeyDetail(advisor.provider));

	onUpdate?.({
		content: [{ type: "text", text: msgConsulting(advisorLabel, effort) }],
		details: { advisorModel: advisorLabel, effort },
	});

	let tempDir: string | undefined;
	try {
		const sessionFile = createForkedSessionFile(ctx);
		const agent = loadAdvisorAgentConfig();
		tempDir = mkdtempSync(join(tmpdir(), "pi-mimir-advisor-"));
		const promptPath = join(tempDir, "advisor-system.txt");
		writeFileSync(promptPath, agent.systemPrompt, { encoding: "utf-8", mode: 0o600 });
		const result = await pi.exec("pi", buildChildArgs(agent, sessionFile, advisor, effort, promptPath), {
			cwd: ctx.cwd,
			signal,
		});
		if (result.code !== 0) {
			const detail = (result.stderr || result.stdout || "").trim();
			return {
				content: [{ type: "text", text: errCallFailed(detail || `exit ${result.code}`) }],
				details: {
					advisorModel: advisorLabel,
					effort,
					errorMessage: detail || `exit ${result.code}`,
					childSessionFile: sessionFile,
				},
			};
		}
		const advisorText = normalizeAdvisorText(result.stdout || "");
		if (!advisorText) {
			return {
				content: [{ type: "text", text: ERR_EMPTY_RESPONSE }],
				details: {
					advisorModel: advisorLabel,
					effort,
					errorMessage: ERR_EMPTY_RESPONSE_DETAIL,
					childSessionFile: sessionFile,
				},
			};
		}
		return {
			content: [{ type: "text", text: advisorText }],
			details: {
				advisorModel: advisorLabel,
				effort,
				childSessionFile: sessionFile,
			},
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return buildErrorResult(advisorLabel, errCallThrew(message), message);
	} finally {
		if (tempDir) rmSync(tempDir, { recursive: true, force: true });
	}
}

export function registerAdvisorTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: ADVISOR_TOOL_NAME,
		label: TOOL_LABEL,
		description: "Escalate to a forked advisor child session for plan, correction, or stop guidance.",
		promptSnippet: ADVISOR_PROMPT_SNIPPET,
		promptGuidelines: ADVISOR_PROMPT_GUIDELINES,
		parameters: AdvisorParams,
		async execute(_toolCallId, _params, signal, onUpdate, ctx) {
			return executeAdvisor(ctx, pi, signal, onUpdate);
		},
	});
}

export function registerAdvisorBeforeAgentStart(pi: ExtensionAPI): void {
	pi.on("before_agent_start", async (_event, ctx) => {
		const advisor = getAdvisorModel();
		const active = pi.getActiveTools();
		const hasTool = active.includes(ADVISOR_TOOL_NAME);
		if (!advisor) {
			if (hasTool) pi.setActiveTools(active.filter((name) => name !== ADVISOR_TOOL_NAME));
			return;
		}
		const blocked = isExecutorBlocked(ctx, pi.getThinkingLevel());
		if (blocked && hasTool) {
			pi.setActiveTools(active.filter((name) => name !== ADVISOR_TOOL_NAME));
		} else if (!blocked && !hasTool) {
			pi.setActiveTools([...active, ADVISOR_TOOL_NAME]);
		}
	});
}

export function registerModelSelectHandler(pi: ExtensionAPI): void {
	pi.on("model_select", async (event, ctx) => {
		if (event.source === "restore") return;
		const advisor = getAdvisorModel();
		if (!advisor) return;
		const blocked = isModelBlocked(event.model, pi.getThinkingLevel());
		const active = pi.getActiveTools();
		const hasTool = active.includes(ADVISOR_TOOL_NAME);
		if (blocked && hasTool) {
			pi.setActiveTools(active.filter((name) => name !== ADVISOR_TOOL_NAME));
			if (ctx.hasUI) ctx.ui.notify(`Advisor disabled for ${modelKey(event.model)}`, "info");
		} else if (!blocked && !hasTool) {
			pi.setActiveTools([...active, ADVISOR_TOOL_NAME]);
			if (ctx.hasUI) ctx.ui.notify(msgAdvisorRestored(modelKey(advisor), getAdvisorEffort()), "info");
		}
	});
}

export function registerThinkingLevelSelectHandler(pi: ExtensionAPI): void {
	pi.on("thinking_level_select", async (event, ctx) => {
		const advisor = getAdvisorModel();
		if (!advisor) return;
		const blocked = isModelBlocked(ctx.model, event.level);
		const active = pi.getActiveTools();
		const hasTool = active.includes(ADVISOR_TOOL_NAME);
		if (blocked && hasTool) {
			pi.setActiveTools(active.filter((name) => name !== ADVISOR_TOOL_NAME));
			if (ctx.hasUI && ctx.model) ctx.ui.notify(`Advisor disabled for ${modelKey(ctx.model)}`, "info");
		} else if (!blocked && !hasTool) {
			pi.setActiveTools([...active, ADVISOR_TOOL_NAME]);
			if (ctx.hasUI) ctx.ui.notify(msgAdvisorRestored(modelKey(advisor), getAdvisorEffort()), "info");
		}
	});
}

export function registerAdvisorCommand(pi: ExtensionAPI): void {
	pi.registerCommand("advisor", {
		description: "Configure the advisor model for forked advisor consultations",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify(MSG_REQUIRES_INTERACTIVE, "error");
				return;
			}
			const availableModels = ctx.modelRegistry.getAvailable();
			const current = getAdvisorModel();
			const currentKey = current ? modelKey(current) : undefined;
			const items: SelectItem[] = availableModels.map((model) => ({
				value: modelKey(model),
				label: `${currentKey === modelKey(model) ? CHECKMARK : ""}${model.name ?? model.id}`,
				description: `${model.provider}:${model.id}`,
			}));
			items.unshift({ value: NO_ADVISOR_VALUE, label: "No advisor", description: "Disable advisor consultations" });
			const choice = await showAdvisorPicker(ctx, items);
			if (choice === null) return;
			if (choice === NO_ADVISOR_VALUE) {
				if (!saveAdvisorConfig(undefined, undefined)) {
					ctx.ui.notify(MSG_PERSIST_FAILED, "error");
					return;
				}
				setAdvisorModel(undefined);
				setAdvisorEffort(undefined);
				const active = pi.getActiveTools();
				if (active.includes(ADVISOR_TOOL_NAME)) {
					pi.setActiveTools(active.filter((name) => name !== ADVISOR_TOOL_NAME));
				}
				ctx.ui.notify(MSG_ADVISOR_DISABLED, "info");
				return;
			}
			const model = availableModels.find((entry) => modelKey(entry) === choice);
			if (!model) {
				ctx.ui.notify(errSelectionNotFound(choice), "error");
				return;
			}
			let effort: ThinkingLevel | undefined;
			const supportedThinkingLevels = (model as { reasoning?: boolean }).reasoning
				? getSupportedThinkingLevels(model).filter((level) => level !== "off")
				: [];
			if (supportedThinkingLevels.length > 0) {
				const items: SelectItem[] = [
					{ value: OFF_VALUE, label: "No extra reasoning", description: "Use the model without explicit reasoning effort" },
					...supportedThinkingLevels.map((level) => ({
						value: level,
						label: `${level}${level === DEFAULT_EFFORT ? RECOMMENDED_EFFORT_SUFFIX : ""}`,
						description: `Run the advisor at ${level} reasoning effort`,
					})),
				];
				const picked = await showEffortPicker(ctx, items, getAdvisorEffort(), DEFAULT_EFFORT);
				if (picked === null) return;
				effort = picked === OFF_VALUE ? undefined : (picked as ThinkingLevel);
			}
			if (!saveAdvisorConfig(modelKey(model), effort)) {
				ctx.ui.notify(MSG_PERSIST_FAILED, "error");
				return;
			}
			setAdvisorModel(model);
			setAdvisorEffort(effort);
			const blocked = isModelBlocked(ctx.model, pi.getThinkingLevel());
			const active = pi.getActiveTools();
			const hasTool = active.includes(ADVISOR_TOOL_NAME);
			if (!blocked && !hasTool) pi.setActiveTools([...active, ADVISOR_TOOL_NAME]);
			if (blocked && hasTool) pi.setActiveTools(active.filter((name) => name !== ADVISOR_TOOL_NAME));
			ctx.ui.notify(blocked ? msgAdvisorEnabledInactive(modelKey(model), effort) : msgAdvisorEnabled(modelKey(model), effort), "info");
		},
	});
}
