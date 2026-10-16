/**
 * Rules engine: the operator's own rules in `dredd-rules.md`, one `#` heading
 * per rule with optional `paths:` glob scoping. Every write and edit is
 * judged against the rules that apply to the written path, one compliance
 * question per rule, riding the shared gate runtime so violations land in
 * the ledger like every other guard.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { minimatch } from "minimatch";

export interface Rule {
	id: string;
	text: string;
	/** Glob patterns; when present the rule applies only to matching project-relative paths. */
	paths: string[];
}

export interface RulesFile {
	path: string;
	rules: Rule[];
}

/**
 * Parse `dredd-rules.md`. Each `#` heading is a rule id; the body under it
 * is the rule text; a `paths:` line inside the body scopes the rule.
 */
export function parseRules(content: string): Rule[] {
	const rules: Rule[] = [];
	const lines = content.split("\n");
	let current: Rule | undefined;
	for (const line of lines) {
		const heading = /^#\s+(.+)$/.exec(line);
		if (heading) {
			current = { id: heading[1]?.trim() ?? "", text: "", paths: [] };
			rules.push(current);
			continue;
		}
		if (!current) continue;
		const pathsLine = /^paths:\s*(.+)$/.exec(line);
		if (pathsLine) {
			current.paths = pathsLine[1]?.split(",").map(p => p.trim()).filter(Boolean) ?? [];
			continue;
		}
		current.text += (current.text ? "\n" : "") + line;
	}
	return rules.filter(rule => rule.text.trim().length > 0 || rule.paths.length > 0).map(rule => ({ ...rule, text: rule.text.trim() }));
}

/** Load rules for a project root: dredd-rules.md only, no fallbacks. */
export function loadRules(projectRoot: string): RulesFile | undefined {
	const path = join(projectRoot, "dredd-rules.md");
	if (!existsSync(path)) return undefined;
	// An unreadable rules file throws rather than silently disabling the rules guard.
	return { path, rules: parseRules(readFileSync(path, "utf-8")) };
}

/** Which rules apply to a project-relative path: unscoped ones plus glob matches. */
export function rulesForPath(rules: readonly Rule[], relPath: string): Rule[] {
	return rules.filter(rule => rule.paths.length === 0 || rule.paths.some(glob => minimatch(relPath, glob)));
}

/** One compliance question per applicable rule, keyed by rule index. */
export function ruleQuestions(applicable: readonly Rule[]): Record<string, { type: "noul"; instructions: string }> {
	const questions: Record<string, { type: "noul"; instructions: string }> = {};
	applicable.forEach((rule, index) => {
		questions[`rule${index}`] = {
			type: "noul",
			instructions: `Rule "${rule.id}": ${rule.text}. Does this written content comply with that rule?`,
		};
	});
	return questions;
}

/** Read answers back per rule, aligned with ruleQuestions order. */
export function ruleViolations(applicable: readonly Rule[], answers: Record<string, unknown>, threshold: number): Array<{ rule: string; score: number }> {
	const out: Array<{ rule: string; score: number }> = [];
	applicable.forEach((rule, index) => {
		const answer = answers[`rule${index}`] as { type?: string; noul?: unknown } | undefined;
		// noul answers "does this comply", so violation is the complement.
		if (answer?.type !== "noul") return;
		const complies = answer.noul;
		if (typeof complies === "number" && Number.isFinite(complies) && 1 - complies >= threshold) {
			out.push({ rule: rule.id, score: 1 - complies });
		}
	});
	return out;
}

/** Project-relative path for a written file, or undefined outside the project. */
export function projectRelPath(filePath: string, projectRoot: string): string | undefined {
	const rel = relative(projectRoot, filePath);
	if (rel.startsWith("..") || rel === "") return undefined;
	return rel;
}