/**
 * Direct-trust memory. `dredd_remember` records a lesson and it is confirmed
 * in the same call — no second-session corroboration, no scan of past
 * sessions. The user invoked the tool directly; that is the confirmation.
 * A confirmed lesson becomes an enforceable policy question that rides every
 * gate request, instead of pi-warden's one prompt line at session start.
 */

export interface LessonRecord {
	text: string;
	confirmedAt: number;
	source: string;
}

export interface LessonsStore {
	lessons: LessonRecord[];
}

export const LESSON_CHARS = 200;

/**
 * Record a lesson. Unlike pi-warden's recordLesson (prefs.ts:792-825), the
 * only rejections are mechanical: empty or over-long text. "Weakens a check"
 * and "task-bound" refusals are gone — the operator owns the taxonomy.
 */
export function recordLesson(store: LessonsStore, raw: string, now: number, source: string): { reply: string; store: LessonsStore } {
	const text = raw.trim();
	if (text.length === 0) return { reply: "not recorded: empty lesson", store };
	if (text.length > LESSON_CHARS) return { reply: `not recorded: longer than ${LESSON_CHARS} characters`, store };
	const lessons = [...store.lessons.filter(lesson => lesson.text !== text), { text, confirmedAt: now, source }];
	return { reply: `recorded and confirmed: "${text}". It rides every judged call until you forget it with /dredd forget.`, store: { lessons } };
}

export function forgetLesson(store: LessonsStore, raw: string): { reply: string; store: LessonsStore } {
	const text = raw.trim();
	if (text.length === 0) return { reply: "state the lesson text to forget", store };
	const before = store.lessons.length;
	const lessons = store.lessons.filter(lesson => lesson.text !== text);
	if (lessons.length === before) return { reply: `no recorded lesson matches: "${text}"`, store };
	return { reply: `forgotten: "${text}"`, store: { lessons } };
}

/**
 * Compile confirmed lessons into policy questions riding the gate request,
 * ohmyjev's POLICY_Q pattern (policy.ts:144-166): one noul question per
 * lesson, scored against each guarded call's state.
 */
export function compilePolicyQuestions(lessons: readonly LessonRecord[]): Record<string, { type: "noul"; instructions: string }> {
	const questions: Record<string, { type: "noul"; instructions: string }> = {};
	lessons.forEach((lesson, index) => {
		questions[`policy${index}`] = {
			type: "noul",
			instructions: `Does this call violate the operator's standing rule: "${lesson.text}"?`,
		};
	});
	return questions;
}

/** Read answers back per lesson, aligned with compilePolicyQuestions order. */
export function policyViolations(lessons: readonly LessonRecord[], answers: Record<string, unknown>, threshold: number): Array<{ lesson: string; score: number }> {
	const out: Array<{ lesson: string; score: number }> = [];
	lessons.forEach((lesson, index) => {
		const answer = answers[`policy${index}`] as { type?: string; noul?: unknown } | undefined;
		if (answer?.type !== "noul") return;
		const noul = answer.noul;
		if (typeof noul === "number" && Number.isFinite(noul) && noul >= threshold) out.push({ lesson: lesson.text, score: noul });
	});
	return out;
}