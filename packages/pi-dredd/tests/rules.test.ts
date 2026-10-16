import { describe, expect, it } from "vitest";
import { parseRules, projectRelPath, ruleQuestions, rulesForPath, ruleViolations } from "../lib/rules";

const SAMPLE = `# Errors never reach the user raw
Catch errors at the handler and return a message a user can act on.

# Migrations need a ticket
paths: db/migrations/**
Every migration names its ticket in the filename.

# No secrets in source
Never commit credentials, tokens, or keys.
`;

describe("parseRules", () => {
	it("splits on headings, keeps paths lines out of the text", () => {
		const rules = parseRules(SAMPLE);
		expect(rules.map(r => r.id)).toEqual(["Errors never reach the user raw", "Migrations need a ticket", "No secrets in source"]);
		expect(rules[0]?.text).toContain("Catch errors at the handler");
		expect(rules[1]?.paths).toEqual(["db/migrations/**"]);
		expect(rules[1]?.text).toContain("Every migration");
		expect(rules[1]?.text).not.toContain("paths:");
	});

	it("drops rules with no body", () => {
		const rules = parseRules("# only a heading\n");
		expect(rules).toEqual([]);
	});
});

describe("rulesForPath", () => {
	const rules = parseRules(SAMPLE);

	it("unscoped rules apply everywhere", () => {
		expect(rulesForPath(rules, "src/api/handler.ts").map(r => r.id)).toContain("No secrets in source");
	});

	it("scoped rules apply only on glob match", () => {
		expect(rulesForPath(rules, "db/migrations/0001-add-users.sql").map(r => r.id)).toContain("Migrations need a ticket");
		expect(rulesForPath(rules, "src/api/handler.ts").map(r => r.id)).not.toContain("Migrations need a ticket");
	});
});

describe("ruleQuestions and ruleViolations", () => {
	const rules = parseRules(SAMPLE);
	const applicable = rulesForPath(rules, "src/api/handler.ts");

	it("builds one question per applicable rule", () => {
		const questions = ruleQuestions(applicable);
		expect(Object.keys(questions).sort()).toEqual(["rule0", "rule1"]);
		expect(questions.rule0?.instructions).toContain("Errors never reach the user raw");
	});

	it("reads violations as the complement of compliance", () => {
		const answers = { rule0: { type: "noul", noul: 0.05 }, rule1: { type: "noul", noul: 0.9 } };
		const violations = ruleViolations(applicable, answers, 0.8);
		expect(violations).toEqual([{ rule: "Errors never reach the user raw", score: 0.95 }]);
		expect(ruleViolations(applicable, { rule0: { type: "noul", noul: 0.99 } }, 0.8)).toEqual([]);
	});
});

describe("projectRelPath", () => {
	it("returns the relative path inside the project", () => {
		expect(projectRelPath("/proj/src/a.ts", "/proj")).toBe("src/a.ts");
	});

	it("returns undefined outside the project", () => {
		expect(projectRelPath("/elsewhere/a.ts", "/proj")).toBeUndefined();
	});
});