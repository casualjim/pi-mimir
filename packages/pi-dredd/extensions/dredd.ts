import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { detectDreddHost, effectiveConfig, loadSettings, resolveSettingsFile, type DreddConfig } from "../lib/settings";
import { openLedger, type ViolationsDb } from "../lib/ledger";
import { forgetLesson, recordLesson, type LessonsStore } from "../lib/memory";
import { floorCheck, gateQuestions, isReadOnlyCommand } from "../lib/gate";
import { runGate } from "../lib/gate-runtime";
import { ask } from "../lib/jev";
import { causeQuestions, classifyCheckResult, doneQuestions, noteFailure, screenQuestions, securityQuestions, slopQuestions, stuckDue, stuckQuestions, type AttemptWindow } from "../lib/verifiers";
import { loadRules, projectRelPath, ruleQuestions, rulesForPath, ruleViolations, type RulesFile } from "../lib/rules";
import { buildAppendix, dedupeRuns, repeatedTail, saveOutput, trimOutput, TRIM_OVER, type AppendixEntry } from "../lib/context";
import type { Question } from "../lib/jev";
import { askJev, COMPACT_MIN_PERCENT } from "../lib/speed";
import { forcedSkillMessage, pickSkill, skillBody, skillSteer, type SkillCandidate } from "../lib/skills";
import { resolveSkillPath } from "../lib/skill-paths";
/**
 * pi-dredd: judge-everything guard extension. This entry wires the shared
 * config, the violation ledger, and the direct-trust lesson store into the
 * tools and commands the operator and agent see. Guards consume the same
 * ledger via registerLedger as their units land.
 */

const LESSONS_FILE = "lessons.json";

function dataDir(host: "omp" | "pi", env: NodeJS.ProcessEnv = process.env): string {
	const agentDir = env.PI_CODING_AGENT_DIR?.trim();
	if (agentDir) return path.join(agentDir.replace(/^~(?=\/|$)/, os.homedir()), "dredd");
	const root = host === "omp" ? path.join(os.homedir(), ".omp", "agent") : path.join(os.homedir(), ".pi", "agent");
	return path.join(root, "dredd");
}

export function loadLessons(file: string): LessonsStore {
	try {
		const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf-8"));
		if (parsed && typeof parsed === "object" && Array.isArray((parsed as { lessons?: unknown }).lessons)) {
			const lessons = (parsed as { lessons: unknown[] }).lessons.filter(
				(l): l is { text: string; confirmedAt: number; source: string } =>
					l !== null && typeof l === "object" && typeof (l as { text?: unknown }).text === "string",
			);
			return { lessons };
		}
	} catch {
		// Missing or malformed store starts empty.
	}
	return { lessons: [] };
}

function saveLessons(file: string, store: LessonsStore): void {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, JSON.stringify(store, null, "\t") + "\n", { mode: 0o600 });
}

function formatViolations(rows: Array<{ id: number; guard: string; tool: string | null; subject: string; finding: string; score: number | null; steered: boolean; timestamp: number }>): string {
	if (rows.length === 0) return "dredd: no recorded violations for this project.";
	const lines = rows.map(
		r =>
			`${new Date(r.timestamp).toISOString().slice(0, 19)} ${r.guard} ${r.tool ?? "-"} ${r.finding}${r.score !== null ? ` (score ${r.score})` : ""}${r.steered ? " [steered]" : ""} :: ${r.subject.slice(0, 120)}`,
	);
	return `dredd: ${rows.length} most recent violation(s):\n${lines.join("\n")}`;
}

export function registerLedger(pi: ExtensionAPI, config: DreddConfig, host: "omp" | "pi", lessonsIn: LessonsStore): void {
	const dir = dataDir(host);
	const ledger: ViolationsDb = openLedger(path.join(dir, "violations.db"));
	const lessonsFile = path.join(dir, LESSONS_FILE);
	let lessons = lessonsIn;

	pi.registerTool({
		name: "dredd_remember",
		label: "Remember lesson",
		description:
			"Record a standing lesson about how to work in this project. The lesson is confirmed immediately and enforced on every judged call until the operator forgets it. State one rule per call, under 200 characters.",
		parameters: Type.Object({ lesson: Type.String({ description: "The standing rule, e.g. 'never force-push to main'." }) }),
		async execute(_toolCallId, params) {
			const { reply, store } = recordLesson(lessons, params.lesson, Date.now(), "dredd_remember");
			if (store !== lessons) {
				lessons = store;
				saveLessons(lessonsFile, lessons);
			}
			return { content: [{ type: "text", text: reply }], details: undefined };
		},
	});

	pi.registerTool({
		name: "dredd_forget",
		label: "Forget lesson",
		description: "Remove a recorded lesson. State the exact lesson text.",
		parameters: Type.Object({ lesson: Type.String({ description: "The exact lesson text to forget." }) }),
		async execute(_toolCallId, params) {
			const { reply, store } = forgetLesson(lessons, params.lesson);
			if (store !== lessons) {
				lessons = store;
				saveLessons(lessonsFile, lessons);
			}
			return { content: [{ type: "text", text: reply }], details: undefined };
		},
	});

	pi.registerCommand("dredd", {
		description: "pi-dredd: violations ledger, lessons, status",
		handler: async (args: string, ctx: ExtensionContext) => {
			const [sub, ...rest] = args.trim().split(/\s+/);
			if (sub === "violations" || sub === "") {
				ctx.ui.notify(formatViolations(ledger.recent(ctx.cwd, 20)), "info");
				return;
			}
			if (sub === "counts") {
				const counts = ledger.countsByGuard(ctx.cwd);
				const text = Object.keys(counts).length === 0 ? "dredd: no recorded violations for this project." : Object.entries(counts).map(([g, n]) => `${g}: ${n}`).join(", ");
				ctx.ui.notify(`dredd: ${text}`, "info");
				return;
			}
			if (sub === "forget") {
				const text = rest.join(" ").trim();
				const { reply, store } = forgetLesson(lessons, text);
				if (store !== lessons) {
					lessons = store;
					saveLessons(lessonsFile, lessons);
				}
				ctx.ui.notify(reply, "info");
				return;
			}
			if (sub === "lessons") {
				const text = lessons.lessons.length === 0 ? "no lessons recorded" : lessons.lessons.map(l => `- ${l.text}`).join("\n");
				ctx.ui.notify(`dredd: ${text}`, "info");
				return;
			}
			if (sub === "status") {
				const backendLabel = typeof config.backend === "string" ? config.backend : config.backend.label;
				ctx.ui.notify(`dredd: ${config.enabled ? "enabled" : "disabled"}, backend ${backendLabel}, capture ${config.capture}, ${lessons.lessons.length} lesson(s)${config.loadError ? ` — WARNING: ${config.loadError}` : ""}`, config.loadError ? "warning" : "info");
				return;
			}
			ctx.ui.notify(`dredd: unknown subcommand '${sub}'. Use violations, counts, lessons, forget <text>, or status.`, "warning");
		},
	});
}

export interface DreddRuntime {
	config: DreddConfig;
	lessons: LessonsStore;
	ledger: ViolationsDb;
	host: "omp" | "pi";
	/** The command the gate held last; the operator's next reply may approve it. */
	pendingHold: { command: string; ts: number } | null;
	/** An operator-approved command: the identical retry passes exactly once. */
	approved: { command: string } | null;
}

/** The shared runtime guards consume: config, lessons, ledger. */
export function createRuntime(pi: ExtensionAPI): DreddRuntime {
	const host = detectDreddHost(pi);
	const settingsPath = resolveSettingsFile(host);
	const config = effectiveConfig(loadSettings(settingsPath));
	const dir = dataDir(host);
	return { config, lessons: loadLessons(path.join(dir, LESSONS_FILE)), ledger: openLedger(path.join(dir, "violations.db")), host, pendingHold: null, approved: null };
}

/**
 * The bash gate: offline floor first (holds with no key), then the judge
 * under capture rules. `recall` judges everything; `strict` keeps the
 * read-only skip; `balanced` skips read-only reads of other tools only
 * when they name no write. Every non-allow verdict is recorded; only a
 * hold blocks, and the reason tells the agent to ask the operator.
 */
export function registerGate(pi: ExtensionAPI, runtime: DreddRuntime): void {
	const { config, ledger } = runtime;
	let cwd = process.cwd();
	let sessionId: string | null = null;
	pi.on("session_start", (event, ctx) => {
		cwd = ctx.cwd;
		const withId = event as { sessionId?: unknown };
		sessionId = typeof withId.sessionId === "string" ? withId.sessionId : null;
	});
	pi.on("tool_call", async (event, ctx) => {
		if (!config.enabled) return undefined;
		if (event.toolName !== "bash") return undefined;
		const command = (event.input as { command?: unknown }).command;
		if (typeof command !== "string" || command.length === 0) return undefined;
		// Operator approval: the identical retry of an approved command passes once.
		if (runtime.approved && runtime.approved.command === command) {
			runtime.approved = null;
			ledger.insert({
				timestamp: Date.now(), sessionId, projectRoot: cwd, guard: "gate", tool: "bash",
				subject: command.slice(0, 400), finding: "operator approved after hold", score: null, steered: false,
			});
			return undefined;
		}
		const floorHits = floorCheck(command);
		if (floorHits.length > 0) {
			ledger.insert({
				timestamp: Date.now(), sessionId, projectRoot: cwd, guard: "gate", tool: "bash",
				subject: command.slice(0, 400), finding: `floor: ${floorHits.map(h => h.id).join(",")}`, score: null, steered: false,
			});
			runtime.pendingHold = { command, ts: Date.now() };
			return {
				block: true,
				reason: `pi-dredd blocked this: ${floorHits.map(h => h.reason).join("; ")}. Tell the operator what was blocked and why; run it only when they say yes.`,
			};
		}
		if (config.capture !== "recall" && isReadOnlyCommand(command)) return undefined;
		const outcome = await runGate(
			{ config, lessons: () => runtime.lessons.lessons, ledger, env: process.env, fetchImpl: fetch, projectRoot: () => cwd, sessionId: () => sessionId },
			"gate", "call", command.slice(0, 400), "bash",
			gateQuestions(),
		);
		if (outcome.verdict.level === "hold") {
			const reason = outcome.verdict.reasons.join("; ");
			runtime.pendingHold = { command, ts: Date.now() };
			if (ctx.hasUI) ctx.ui.notify(`dredd: held a bash call (${reason})`, "warning");
			return {
				block: true,
				reason: `pi-dredd blocked this: ${reason}. Tell the operator what was blocked and why, and ask whether to run it anyway.`,
			};
		}
		if (outcome.verdict.level === "warn" && ctx.hasUI) {
			ctx.ui.notify(`dredd: warning on a bash call (${outcome.verdict.reasons.join("; ")})`, "warning");
		}
		return undefined;
	});
}

/**
 * Verifier guards: done-check and cause-check on agent_end, stuck on
 * tool_result, slop and security riding the gate on writes, screen on tool
 * results. Every detection lands in the ledger; steers are short messages
 * the agent reads, holds only from the gate.
 */
export function registerVerifiers(pi: ExtensionAPI, runtime: DreddRuntime): void {
	const { config, ledger } = runtime;
	const deps = { config, lessons: () => runtime.lessons.lessons, ledger, env: process.env, fetchImpl: fetch, projectRoot: () => verifierCwd, sessionId: () => verifierSessionId };
	let verifierCwd = process.cwd();
	let verifierSessionId: string | null = null;
	let window: AttemptWindow = { failures: [] };
	let sawPassedCheck = false;
	let lastCheckPassedAt = 0;
	let rulesFile: RulesFile | undefined;

	pi.on("session_start", (event, ctx) => {
		verifierCwd = ctx.cwd;
		const withId = event as { sessionId?: unknown };
		verifierSessionId = typeof withId.sessionId === "string" ? withId.sessionId : null;
		window = { failures: [] };
		sawPassedCheck = false;
		try {
			rulesFile = loadRules(ctx.cwd);
		} catch (error) {
			rulesFile = undefined;
			if (ctx.hasUI) ctx.ui.notify(`dredd: rules file exists but could not be read (${error instanceof Error ? error.message : String(error)}); rules guard is off`, "warning");
		}
	});

	pi.on("tool_call", async (event, ctx) => {
		if (!config.enabled) return undefined;
		// Slop, security, and rules ride write and edit calls; the bash gate handles commands.
		if (event.toolName !== "write" && event.toolName !== "edit") return undefined;
		const content = (event.input as { content?: unknown }).content;
		const filePath = (event.input as { path?: unknown }).path;
		if (typeof content !== "string" || content.length === 0) return undefined;
		const questions: Record<string, Question> = { ...slopQuestions(), ...securityQuestions() };
		const writtenRel = typeof filePath === "string" ? projectRelPath(filePath, verifierCwd) : undefined;
		const applicable = rulesFile && writtenRel ? rulesForPath(rulesFile.rules, writtenRel) : [];
		const ruleQs = ruleQuestions(applicable);
		for (const [id, q] of Object.entries(ruleQs)) questions[id] = q;
		const outcome = await runGate(deps, "slop", "call", content.slice(0, 2000), event.toolName, questions);
		if (outcome.violation) {
			const violations = ruleViolations(applicable, outcome.verdict.scores, 0.8);
			for (const v of violations) {
				ledger.insert({
					timestamp: Date.now(), sessionId: verifierSessionId, projectRoot: verifierCwd, guard: "rules",
					tool: event.toolName, subject: (writtenRel ?? content.slice(0, 120)), finding: `rule "${v.rule}"`, score: v.score, steered: false,
				});
			}
			if (ctx.hasUI) {
				ctx.ui.notify(`dredd: findings on a write (${outcome.verdict.reasons.join("; ")})`, "warning");
			}
		}
		return undefined;
	});

	pi.on("tool_result", async (event, ctx) => {
		if (!config.enabled) return undefined;
		if (event.toolName === "bash") {
			const command = typeof event.input.command === "string" ? event.input.command : "";
			const { isCheck, passed } = classifyCheckResult(command, event.isError ? 1 : 0);
			if (isCheck && passed) {
				sawPassedCheck = true;
				lastCheckPassedAt = Date.now();
			}
			if (event.isError) {
				window = noteFailure(window, command, Date.now());
				if (stuckDue(window, Date.now())) {
					const outcome = await runGate(deps, "stuck", "call", window.failures.map(f => f.command).slice(-3).join(" | ").slice(0, 400), "bash", stuckQuestions());
					if (outcome.violation && ctx.hasUI) {
						ctx.ui.notify("dredd: same failing approach three times; state a new hypothesis instead of retrying", "warning");
					}
					window = { failures: [] };
				}
			}
		}
		// Screen tool output for injection and exfil only under recall: balanced reserves the judge for writes and commands.
		if (config.capture === "recall") {
			const text = event.content
				.filter((part): part is { type: "text"; text: string } => part.type === "text")
				.map(part => part.text)
				.join("\n");
			if (text.length > 0 && event.toolName !== "bash") {
				const outcome = await runGate(deps, "screen", "output", text.slice(0, 2000), event.toolName, screenQuestions());
				if (outcome.violation && ctx.hasUI) {
					ctx.ui.notify(`dredd: tool output carries instructions or exfil risk (${outcome.verdict.reasons.join("; ")})`, "warning");
				}
			}
		}
		return undefined;
	});

	pi.on("agent_end", async (event, ctx) => {
		if (!config.enabled) return undefined;
		// agent_end carries every message of the run; the last assistant text is the reply under check.
		let last: { role: string; content: unknown } | undefined;
		for (let i = event.messages.length - 1; i >= 0; i--) {
			const m = event.messages[i];
			if (m && m.role === "assistant") {
				last = m;
				break;
			}
		}
		if (!last) return undefined;
		const parts = Array.isArray(last.content) ? last.content : [];
		const text = parts.filter((p): p is { type: "text"; text: string } => p !== null && typeof p === "object" && "type" in p && p.type === "text").map(p => p.text).join("\n");
		if (text.trim().length === 0) return undefined;
		const recentlyChecked = sawPassedCheck && Date.now() - lastCheckPassedAt < 5 * 60 * 1000;
		if (!recentlyChecked) {
			const done = await runGate(deps, "done", "reply", text.slice(0, 2000), null, doneQuestions());
			if (done.violation && ctx.hasUI) {
				ctx.ui.notify("dredd: a completion claim with no passing check this run; run one before calling it done", "warning");
			}
		}
		const cause = await runGate(deps, "cause", "reply", text.slice(0, 2000), null, causeQuestions());
		if (cause.violation && ctx.hasUI) {
			ctx.ui.notify("dredd: a stated cause or hand-off with nothing checked; verify it or say plainly it is unverified", "warning");
		}
		return undefined;
	});
}

/**
 * Context guards: trim and save long bash output, collapse repeated runs,
 * abort a stream repeating itself, and hand compaction an evidence
 * appendix. The runaway abort is offline and immediate.
 */
export function registerContext(pi: ExtensionAPI, runtime: DreddRuntime): void {
	const { config, ledger } = runtime;
	let cwd = process.cwd();
	let sessionId: string | null = null;
	const appendix: AppendixEntry[] = [];

	pi.on("session_start", (event, ctx) => {
		cwd = ctx.cwd;
		const withId = event as { sessionId?: unknown };
		sessionId = typeof withId.sessionId === "string" ? withId.sessionId : null;
		appendix.length = 0;
	});

	pi.on("tool_result", async (event, ctx) => {
		if (!config.enabled) return undefined;
		if (event.toolName !== "bash") return undefined;
		const text = event.content
			.filter((part): part is { type: "text"; text: string } => part.type === "text")
			.map(part => part.text)
			.join("\n");
		if (text.length <= TRIM_OVER) return undefined;
		const key = event.toolCallId.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 24) || "bash";
		const saved = saveOutput(text, key);
		appendix.push({ kind: "saved", text: saved.path });
		const trimmed = trimOutput(dedupeRuns(text));
		ledger.insert({
			timestamp: Date.now(), sessionId, projectRoot: cwd, guard: "context", tool: "bash",
			subject: `output ${text.length} chars -> ${trimmed.length}`, finding: `trim+save ${saved.path}`, score: null, steered: false,
		});
		if (ctx.hasUI) ctx.ui.notify(`dredd: trimmed a ${text.length}-character output; ${saved.pointer}`, "info");
		return { content: [{ type: "text", text: trimmed }] };
	});

	pi.on("message_update", async (event, ctx) => {
		if (!config.enabled) return undefined;
		const streaming = event as { assistantMessageEvent?: { text?: unknown } };
		const text = typeof streaming.assistantMessageEvent?.text === "string" ? streaming.assistantMessageEvent.text : "";
		if (repeatedTail(text) === 0) return undefined;
		appendix.push({ kind: "failed", text: "runaway reply stopped (repeating blocks)" });
		if (ctx.hasUI) ctx.ui.notify("dredd: stopped a reply repeating itself", "error");
		ctx.abort();
		return undefined;
	});


	pi.on("session_compact", async _event => {
		const text = buildAppendix(appendix);
		if (text.length === 0) return undefined;
		appendix.length = 0;
		pi.sendMessage({ customType: "pi-dredd-appendix", content: text, display: false });
	});
}

/**
 * Skill candidates for the current prompt. Upstream pi carries the loaded
 * skills on the before_agent_start event (systemPromptOptions.skills); omp
 * exposes pi.pi.getActiveSkills() instead, the same surface ohmyjev's
 * adapter reads.
 */
function skillCandidates(pi: ExtensionAPI, event: unknown): SkillCandidate[] {
	const toCandidate = (s: unknown): SkillCandidate | undefined => {
		if (s === null || typeof s !== "object" || typeof (s as { name?: unknown }).name !== "string") return undefined;
		const entry = s as { name: string; description?: unknown; filePath?: unknown };
		return { name: entry.name, description: typeof entry.description === "string" ? entry.description : "", filePath: typeof entry.filePath === "string" ? entry.filePath : undefined };
	};
	const options = (event as { systemPromptOptions?: { skills?: unknown } }).systemPromptOptions;
	if (options && Array.isArray(options.skills)) {
		return options.skills.map(toCandidate).filter((s): s is SkillCandidate => s !== undefined);
	}
	const active = (pi as { pi?: { getActiveSkills?: () => unknown } }).pi?.getActiveSkills?.();
	if (Array.isArray(active)) {
		return active.map(toCandidate).filter((s): s is SkillCandidate => s !== undefined);
	}
	return [];
}

/**
 * omp's extension adapter strips filePath from skills, so look the file up
 * by name under the host's skill roots when the surface omits it.
 */
function fillSkillPaths(candidates: SkillCandidate[], host: "omp" | "pi"): SkillCandidate[] {
	const agentRoot = host === "omp" ? path.join(os.homedir(), ".omp", "agent") : path.join(os.homedir(), ".pi", "agent");
	const pluginRoot = host === "omp" ? path.join(os.homedir(), ".omp", "plugins", "node_modules") : path.join(os.homedir(), ".pi", "agent", "npm", "node_modules");
	return candidates.map(candidate => candidate.filePath ? candidate : { ...candidate, filePath: resolveSkillPath(candidate.name, agentRoot, pluginRoot) });
}

/** Judge whether the operator's message is a standing correction; when it
 * is, record it as a lesson that rides every future gate. */
async function learnCorrection(config: DreddConfig, runtime: DreddRuntime, prompt: string): Promise<string | undefined> {
	if (prompt.trim().length === 0) return undefined;
	const state = { message: prompt.slice(0, 1000), guard: "correction" };
	const questions = { correction: { type: "noul" as const, instructions: 'Does this message state a standing rule or correction the agent must follow in all future work (not a one-time instruction for the current task)?' } };
	try {
		const outcome = await ask({ backend: config.backend, apiKey: config.apiKey, model: config.model, timeoutMs: config.timeoutMs, keyResolver: config.keyResolver }, state, questions, process.env, fetch);
		const answer = outcome.answers.correction;
		if (answer?.type !== "noul" || answer.noul < 0.8) return undefined;
		const text = prompt.trim().slice(0, 300);
		if (runtime.lessons.lessons.some(lesson => lesson.text === text)) return undefined;
		runtime.lessons.lessons.push({ text, confirmedAt: Date.now(), source: "operator-correction" });
		const lessonsFile = path.join(dataDir(runtime.host), LESSONS_FILE);
		saveLessons(lessonsFile, runtime.lessons);
		return text;
	} catch (error) {
		// The correction is not lost: the message stays in the conversation; recording it is retried on the next correction.
		runtime.ledger.insert({
			timestamp: Date.now(), sessionId: null, projectRoot: "", guard: "correction",
			tool: null, subject: prompt.slice(0, 200), finding: `correction judge unreachable: ${error instanceof Error ? error.message : String(error)}`, score: null, steered: false,
		});
		return undefined;
	}
}
/**
 * Speed tier: one judge request per prompt picks the skill the conversation
 * needs and reads whether the topic changed from the last prompt. A chosen
 * skill steers the agent with a pointer; a real topic switch drives
 * auto-compact when the context is part-full. ask_jev gives the agent direct
 * typed judgments. Main-model routing stays cut: setModel needs a Model
 * object the API does not expose by id.
 */
export function registerSpeed(pi: ExtensionAPI, runtime: DreddRuntime): void {
	const { config } = runtime;
	let lastPrompt: string | undefined;

	pi.on("before_agent_start", async (event, ctx) => {
		if (!config.enabled) return undefined;
		const prompt = typeof (event as { prompt?: unknown }).prompt === "string" ? (event as { prompt: string }).prompt : "";
		// Approval check: when a command is held and the operator replies,
		// one judge question reads whether the reply approves exactly that command.
		if (runtime.pendingHold && prompt.trim().length > 0) {
			const held = runtime.pendingHold.command;
			try {
				const outcome = await ask(
					{ backend: config.backend, apiKey: config.apiKey, model: config.model, timeoutMs: config.timeoutMs, keyResolver: config.keyResolver },
					{ heldCommand: held.slice(0, 400), operatorReply: prompt.slice(0, 500), guard: "approval" },
					{ approves: { type: "noul", instructions: `The gate held this command: "${held.slice(0, 400)}". Does the operator's reply approve running exactly that command?` } },
					process.env,
					fetch,
				);
				const answer = outcome.answers.approves;
				if (answer?.type === "noul" && answer.noul >= 0.7) {
					runtime.approved = { command: held };
					runtime.pendingHold = null;
					if (ctx.hasUI) ctx.ui.notify(`dredd: operator approval recorded for the held command`, "info");
				}
			} catch (error) {
				// The hold stands; the operator can delete or run the command themselves.
				runtime.ledger.insert({
					timestamp: Date.now(), sessionId: null, projectRoot: ctx.cwd, guard: "approval",
					tool: "bash", subject: held.slice(0, 400), finding: `approval judge unreachable: ${error instanceof Error ? error.message : String(error)}`, score: null, steered: false,
				});
			}
		}
		const candidates = fillSkillPaths(skillCandidates(pi, event), runtime.host);
		// Charter: corrections become enforced lessons with no confirmation step.
		const learned = await learnCorrection(config, runtime, prompt);
		if (learned && ctx.hasUI) ctx.ui.notify(`dredd: correction recorded as a lesson: ${learned.slice(0, 120)}`, "info");
		const result = await pickSkill(config, prompt, lastPrompt, candidates, process.env, fetch);
		lastPrompt = prompt;
		if (result.source === "error" && result.error) {
			runtime.ledger.insert({
				timestamp: Date.now(), sessionId: null, projectRoot: ctx.cwd, guard: "skills",
				tool: null, subject: prompt.slice(0, 200), finding: `pick error: ${result.error}`, score: null, steered: false,
			});
		} else {
			if (result.skill !== undefined) {
				const picked = candidates.find(candidate => candidate.name === result.skill);
				// Force: inject the skill's own body when its file is reachable,
				// the way a user invocation injects it; a pointer only as fallback.
				let message: string | undefined;
				if (picked?.filePath) {
					try {
						message = forcedSkillMessage(result, skillBody(picked.filePath));
					} catch (error) {
						// Unreadable skill file: fall back to the pointer steer and record why.
						runtime.ledger.insert({
							timestamp: Date.now(), sessionId: null, projectRoot: ctx.cwd, guard: "skills",
							tool: null, subject: result.skill, finding: `skill file unreadable, pointer steer used: ${error instanceof Error ? error.message : String(error)}`, score: null, steered: false,
						});
					}
				}
				message ??= skillSteer(result);
				if (message) pi.sendMessage({ customType: "pi-dredd-skill", content: message, display: false });
			}
			if (result.switched) {
				const usage = ctx.getContextUsage();
				if (usage?.percent !== null && usage?.percent !== undefined && usage.percent >= COMPACT_MIN_PERCENT) {
					ctx.compact();
				}
			}
		}
		return undefined;
	});

	pi.registerTool({
		name: "ask_jev",
		label: "Ask the judge",
		description:
			"Ask typed judgment questions about state you name, without reading files into context. Provide JSON state and 1-16 questions; answers return calibrated probabilities.",
		parameters: Type.Object({
			state: Type.Record(Type.String(), Type.Unknown()),
			questions: Type.Record(Type.String(), Type.Unknown()),
		}),
		async execute(_toolCallId, params) {
			const questions = params.questions as Record<string, { type: string; instructions: string; criteria?: unknown }>;
			const result = await askJev(config, params.state as Record<string, unknown>, questions as never, process.env, fetch);
			if (!result.ok) {
				return { content: [{ type: "text", text: `ask_jev failed: ${result.error}` }], details: undefined };
			}
			return { content: [{ type: "text", text: JSON.stringify(result.answers, null, "\t") }], details: undefined };
		},
	});
}

export default function dreddExtension(pi: ExtensionAPI) {
	const runtime = createRuntime(pi);
	const config = runtime.config;

	pi.on("session_start", (_event, ctx) => {
		if (!config.enabled) return;
		// Reuse the key the host already holds from /login; no second copy in settings.
		const registry = ctx.modelRegistry as { getApiKeyForProvider?: (provider: string) => Promise<string | undefined> } | undefined;
		if (registry?.getApiKeyForProvider) config.keyResolver = provider => registry.getApiKeyForProvider!(provider);
		const backendLabel = typeof config.backend === "string" ? config.backend : config.backend.label;
		const extra = config.questions.length > 0 ? `, ${config.questions.length} custom question(s)` : "";
		ctx.ui.notify(`dredd: enabled, backend ${backendLabel}, capture ${config.capture}${extra}`, "info");
	});

	if (!config.enabled) return;
	registerLedger(pi, config, runtime.host, runtime.lessons);
	registerGate(pi, runtime);
	registerVerifiers(pi, runtime);
	registerContext(pi, runtime);
	registerSpeed(pi, runtime);
}