import { describe, expect, it } from "vitest";
import { causeQuestions, classifyCheckResult, doneQuestions, noteFailure, screenQuestions, securityQuestions, slopQuestions, stuckDue, stuckQuestions, type AttemptWindow, STUCK_WINDOW_MS } from "../lib/verifiers";

describe("check evidence", () => {
	it("recognizes test, build, and lint commands", () => {
		expect(classifyCheckResult("pnpm test", 0).isCheck).toBe(true);
		expect(classifyCheckResult("cargo test", 0).passed).toBe(true);
		expect(classifyCheckResult("npm run lint", 0).isCheck).toBe(true);
		expect(classifyCheckResult("mise run test", 0).isCheck).toBe(true);
		expect(classifyCheckResult("npm run check", 0).isCheck).toBe(true);
	});

	it("a failing check is a check that did not pass", () => {
		expect(classifyCheckResult("vitest run", 1).isCheck).toBe(true);
		expect(classifyCheckResult("vitest run", 1).passed).toBe(false);
	});

	it("ordinary commands are not checks", () => {
		expect(classifyCheckResult("ls -la", 0).isCheck).toBe(false);
		expect(classifyCheckResult("echo hi", 0).isCheck).toBe(false);
	});
});

describe("stuck window", () => {
	const now = 1_000_000;

	it("needs three same-head failures in the window", () => {
		let w: AttemptWindow = { failures: [] };
		w = noteFailure(w, "cargo test", now);
		w = noteFailure(w, "cargo test", now + 1000);
		expect(stuckDue(w, now + 2000)).toBe(false);
		w = noteFailure(w, "cargo test", now + 2000);
		expect(stuckDue(w, now + 3000)).toBe(true);
	});

	it("different approaches do not trip it", () => {
		let w: AttemptWindow = { failures: [] };
		w = noteFailure(w, "cargo test", now);
		w = noteFailure(w, "npm test", now + 1000);
		w = noteFailure(w, "cargo test", now + 2000);
		expect(stuckDue(w, now + 3000)).toBe(false);
	});

	it("failures age out of the window", () => {
		let w: AttemptWindow = { failures: [] };
		w = noteFailure(w, "cargo test", now);
		w = noteFailure(w, "cargo test", now + 1000);
		w = noteFailure(w, "cargo test", now + 2000);
		expect(stuckDue(w, now + STUCK_WINDOW_MS + 1)).toBe(false);
	});
});

describe("question sets", () => {
	it("done questions cover claim and verification", () => {
		expect(Object.keys(doneQuestions()).sort()).toEqual(["claimsDone", "verified"]);
	});

	it("cause questions cover statement and check", () => {
		expect(Object.keys(causeQuestions()).sort()).toEqual(["checked", "statesCause"]);
	});

	it("stuck, slop, security, and screen each name their surface", () => {
		expect(Object.keys(stuckQuestions())).toEqual(["sameApproach"]);
		expect(Object.keys(slopQuestions()).sort()).toEqual(["deadCode", "hedging", "restating", "stub"]);
		expect(Object.keys(securityQuestions())).toEqual(["securityRisk"]);
		expect(Object.keys(screenQuestions()).sort()).toEqual(["exfiltrates", "injection"]);
	});
});