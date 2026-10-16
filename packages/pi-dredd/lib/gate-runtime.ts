/**
 * The gate runtime: one place that owns the ask, the floor, the fold, and
 * the ledger write. Guards call runGate with the call's state and their
 * question bundle; the runtime adds policies and registered questions,
 * sends one request, folds everything, and records whatever was detected.
 */
import { ask, DreddError, type Answers, type Question } from "./jev";
import { compilePolicyQuestions, policyViolations, type LessonRecord } from "./memory";
import type { DreddConfig, RegisteredQuestion } from "./settings";
import type { ViolationsDb } from "./ledger";
import { foldVerdict, type GateVerdict } from "./gate";

export interface GateDeps {
	config: DreddConfig;
	lessons: () => readonly LessonRecord[];
	ledger: ViolationsDb;
	env: NodeJS.ProcessEnv;
	fetchImpl: typeof fetch;
	/** Project root for ledger scoping. */
	projectRoot: () => string;
	/** Session id for ledger rows. */
	sessionId: () => string | null;
}

export interface GateOutcome {
	verdict: GateVerdict;
	/** Ledger row id when a violation was recorded. */
	violation: boolean;
}

/** Registered questions for a surface, converted to wire questions. */
function registeredFor(config: DreddConfig, surface: "call" | "output" | "reply"): Array<{ spec: RegisteredQuestion; key: string }> {
	return config.questions.filter(q => q.appliesTo === surface).map((spec, index) => ({ spec, key: `reg${index}` }));
}

function specToQuestion(spec: RegisteredQuestion): Question {
	if (spec.type === "noul") return { type: "noul", instructions: spec.instructions };
	if (spec.type === "score") return { type: "score", instructions: spec.instructions, criteria: spec.criteria as string[] };
	return { type: "choice", instructions: spec.instructions, criteria: spec.criteria as Record<string, string> };
}

/** Fold registered-question answers against their thresholds. */
function registeredFindings(
	config: DreddConfig,
	surface: "call" | "output" | "reply",
	answers: Answers,
): Array<{ finding: string; score: number; hold: boolean }> {
	const out: Array<{ finding: string; score: number; hold: boolean }> = [];
	for (const { spec, key } of registeredFor(config, surface)) {
		const answer = answers[key];
		if (answer === undefined) continue;
		if (answer.type === "noul" && answer.noul >= spec.threshold) out.push({ finding: spec.id, score: answer.noul, hold: spec.threshold >= 0.9 });
		else if (answer.type === "score") {
			const levels = spec.criteria as string[];
			const normalized = answer.score / Math.max(levels.length - 1, 1);
			if (normalized >= spec.threshold) out.push({ finding: spec.id, score: normalized, hold: spec.threshold >= 0.9 });
		} else if (answer.type === "choice" && answer.confidence >= spec.threshold) {
			out.push({ finding: `${spec.id}:${answer.choice}`, score: answer.confidence, hold: spec.threshold >= 0.9 });
		}
	}
	return out;
}

/**
 * Ask the judge for one guarded surface. `base` carries the guard's own
 * questions; policies and registered questions for the surface ride along.
 * Fail-open: every error path returns a non-blocking outcome with a ledger
 * row naming the error.
 */
export async function runGate(deps: GateDeps, guard: string, surface: "call" | "output" | "reply", subject: string, tool: string | null, base: Record<string, Question>): Promise<GateOutcome> {
	const { config, ledger } = deps;
	const questions: Record<string, Question> = { ...base };
	const lessons = deps.lessons();
	for (const [id, q] of Object.entries(compilePolicyQuestions(lessons))) questions[id] = q;
	for (const { key, spec } of registeredFor(config, surface)) questions[key] = specToQuestion(spec);
	const extrasFrom = (answers: Answers) => [
		...policyViolations(lessons, answers, 0.9).map(v => ({ finding: `policy "${v.lesson}"`, score: v.score, hold: true })),
		...registeredFindings(config, surface, answers),
	];
	if (Object.keys(questions).length === 0) return { verdict: { level: "allow", reasons: [], source: "skip", scores: {} }, violation: false };
	const record = (verdict: GateVerdict, steered: boolean, finding: string, score: number | null) => {
		ledger.insert({
			timestamp: Date.now(),
			sessionId: deps.sessionId(),
			projectRoot: deps.projectRoot(),
			guard,
			tool,
			subject,
			finding,
			score,
			steered,
		});
	};
	try {
		const result = await ask(
			{ backend: config.backend, apiKey: config.apiKey, model: config.model, timeoutMs: config.timeoutMs },
			{ subject, tool, guard },
			questions,
			deps.env,
			deps.fetchImpl,
		);
		const extras = extrasFrom(result.answers);
		const verdict = foldVerdict(result.answers, extras);
		if (verdict.level !== "allow") {
			record(verdict, verdict.level === "hold", verdict.reasons.join("; ") || verdict.level, null);
			return { verdict, violation: true };
		}
		return { verdict, violation: false };
	} catch (error) {
		const message = error instanceof DreddError ? error.message : String(error);
		const verdict: GateVerdict = { level: "allow", reasons: [`judge unavailable: ${message}`], source: "error", scores: {} };
		if (!(error instanceof DreddError) || !error.noKey) {
			record(verdict, false, `judge error: ${message}`, null);
		}
		return { verdict, violation: false };
	}
}