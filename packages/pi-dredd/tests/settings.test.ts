import { describe, expect, it } from "vitest";
import { effectiveConfig, loadSettings, parseQuestions, resolveSettingsFile, type DreddSettings } from "../lib/settings";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function writeTemp(raw: string): string {
	const dir = mkdtempSync(join(tmpdir(), "dredd-settings-"));
	const file = join(dir, "settings.json");
	writeFileSync(file, raw);
	return file;
}

describe("resolveSettingsFile", () => {
	it("prefers PI_DREDD_SETTINGS", () => {
		expect(resolveSettingsFile("pi", { PI_DREDD_SETTINGS: "/tmp/d.json" })).toBe("/tmp/d.json");
	});

	it("honors PI_CODING_AGENT_DIR", () => {
		expect(resolveSettingsFile("pi", { PI_CODING_AGENT_DIR: "/agent" })).toBe("/agent/dredd/settings.json");
	});

	it("falls back to host defaults", () => {
		expect(resolveSettingsFile("omp", {})).toContain(".omp/agent/dredd/settings.json");
		expect(resolveSettingsFile("pi", {})).toContain(".pi/agent/dredd/settings.json");
	});

	it("expands ~ in env values", () => {
		expect(resolveSettingsFile("pi", { PI_DREDD_SETTINGS: "~/d.json" })).not.toContain("~");
	});
});

describe("loadSettings", () => {
	it("returns defaults for a missing file", () => {
		const s = loadSettings("/nonexistent/dredd/settings.json");
		expect(s.enabled).toBeUndefined();
	});

	it("returns defaults for malformed JSON", () => {
		const file = writeTemp("{ not json");
		expect(loadSettings(file).enabled).toBeUndefined();
		rmSync(join(file, ".."), { recursive: true });
	});

	it("parses a full custom backend and questions", () => {
		const file = writeTemp(
			JSON.stringify({
				enabled: true,
				backend: { label: "local", host: "http://localhost:8080", path: "/v1/systemone", keyEnv: "LOCAL_JUDGE_KEY", defaultModel: "our-decision-model" },
				capture: "recall",
				timeoutMs: 2000,
				policies: ["never push to main"],
				questions: [
					{ id: "migrationRan", type: "noul", instructions: "Does this diff edit a migration that already ran?", threshold: 0.7, appliesTo: "call" },
					{ id: "severity", type: "score", instructions: "How severe?", criteria: ["minor", "major"], threshold: 1, appliesTo: "reply" },
					{ id: "Bad-Id", type: "noul", instructions: "x", threshold: 0.5, appliesTo: "call" },
					{ id: "dupeA", type: "noul", instructions: "first", threshold: 0.5, appliesTo: "call" },
					{ id: "dupeA", type: "noul", instructions: "second", threshold: 0.5, appliesTo: "call" },
				],
			}),
		);
		const s = loadSettings(file);
		expect(s.capture).toBe("recall");
		expect(s.backend).toEqual({ label: "local", host: "http://localhost:8080", path: "/v1/systemone", keyEnv: "LOCAL_JUDGE_KEY", defaultModel: "our-decision-model" });
		expect(s.policies).toEqual(["never push to main"]);
		// Bad-Id fails the identifier rule, the dupe keeps the first.
		expect(s.questions?.map(q => q.id)).toEqual(["migrationRan", "severity", "dupeA"]);
		rmSync(join(file, ".."), { recursive: true });
	});
});

describe("parseQuestions", () => {
	it("rejects a choice with non-string criteria", () => {
		expect(parseQuestions([{ id: "a", type: "choice", instructions: "x", criteria: { a: 1 }, threshold: 0.5, appliesTo: "call" }])).toEqual([]);
	});

	it("rejects a score with one level", () => {
		expect(parseQuestions([{ id: "a", type: "score", instructions: "x", criteria: ["only"], threshold: 0.5, appliesTo: "call" }])).toEqual([]);
	});
});

describe("effectiveConfig", () => {
	it("applies defaults over empty settings", () => {
		const c = effectiveConfig({});
		expect(c.enabled).toBe(true);
		expect(c.backend).toBe("typesafe");
		expect(c.timeoutMs).toBe(1500);
		expect(c.capture).toBe("balanced");
		expect(c.questions).toEqual([]);
	});

	it("passes through explicit values", () => {
		const s: DreddSettings = { capture: "strict", policies: ["p"], questions: [{ id: "q", type: "noul", instructions: "i", threshold: 0.5, appliesTo: "call" }] };
		const c = effectiveConfig(s);
		expect(c.capture).toBe("strict");
		expect(c.policies).toEqual(["p"]);
		expect(c.questions).toHaveLength(1);
	});
});