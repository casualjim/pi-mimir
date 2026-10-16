import { describe, expect, it } from "vitest";
import { compilePolicyQuestions, forgetLesson, LESSON_CHARS, policyViolations, recordLesson, type LessonRecord, type LessonsStore } from "../lib/memory";

const empty: LessonsStore = { lessons: [] };

describe("recordLesson", () => {
	it("records and confirms in the same call", () => {
		const { reply, store } = recordLesson(empty, "never push to main", 1000, "dredd_remember");
		expect(reply).toContain("recorded and confirmed");
		expect(store.lessons).toHaveLength(1);
		expect(store.lessons[0]?.confirmedAt).toBe(1000);
		expect(store.lessons[0]?.text).toBe("never push to main");
	});

	it("rejects empty and over-long text", () => {
		expect(recordLesson(empty, "   ", 1000, "dredd_remember").reply).toContain("empty");
		expect(recordLesson(empty, "x".repeat(LESSON_CHARS + 1), 1000, "dredd_remember").reply).toContain(`${LESSON_CHARS} characters`);
	});

	it("re-recording the same text updates it instead of duplicating", () => {
		const first = recordLesson(empty, "never push to main", 1000, "dredd_remember").store;
		const second = recordLesson(first, "never push to main", 2000, "dredd_remember").store;
		expect(second.lessons).toHaveLength(1);
		expect(second.lessons[0]?.confirmedAt).toBe(2000);
	});

	it("accepts a task-bound clause pi-warden would refuse", () => {
		// pi-warden rejects task-bound and "weakens" clauses (prefs.ts:801-802).
		// pi-dredd records them: the operator owns the taxonomy.
		const { reply } = recordLesson(empty, "on this PR, skip the integration tests", 1000, "dredd_remember");
		expect(reply).toContain("recorded and confirmed");
	});
});

describe("forgetLesson", () => {
	it("removes exactly the named lesson", () => {
		const store = recordLesson(recordLesson(empty, "a", 1, "t").store, "b", 2, "t").store;
		const { reply, store: after } = forgetLesson(store, "a");
		expect(reply).toContain("forgotten");
		expect(after.lessons.map(l => l.text)).toEqual(["b"]);
	});

	it("says so when nothing matches", () => {
		const { reply } = forgetLesson(empty, "nope");
		expect(reply).toContain("no recorded lesson matches");
	});
});

describe("policy compilation", () => {
	it("builds one noul question per lesson, in order", () => {
		const lessons: LessonRecord[] = [
			{ text: "never push to main", confirmedAt: 1, source: "dredd_remember" },
			{ text: "always run the formatter", confirmedAt: 2, source: "dredd_remember" },
		];
		const questions = compilePolicyQuestions(lessons);
		expect(Object.keys(questions)).toEqual(["policy0", "policy1"]);
		expect(questions.policy0).toEqual({
			type: "noul",
			instructions: 'Does this call violate the operator\'s standing rule: "never push to main"?',
		});
	});

	it("reads violations back above the threshold only", () => {
		const lessons: LessonRecord[] = [{ text: "rule one", confirmedAt: 1, source: "dredd_remember" }];
		const answers = { policy0: { type: "noul", noul: 0.91 }, unrelated: { type: "noul", noul: 0.99 } };
		const hits = policyViolations(lessons, answers, 0.9);
		expect(hits).toEqual([{ lesson: "rule one", score: 0.91 }]);
		expect(policyViolations(lessons, { policy0: { type: "noul", noul: 0.5 } }, 0.9)).toEqual([]);
		expect(policyViolations(lessons, { policy0: { type: "score", score: 1 } }, 0.9)).toEqual([]);
	});

	it("handles zero lessons", () => {
		expect(compilePolicyQuestions([])).toEqual({});
		expect(policyViolations([], {}, 0.9)).toEqual([]);
	});
});