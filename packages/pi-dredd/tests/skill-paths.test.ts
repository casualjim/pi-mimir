import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveSkillPath } from "../lib/skill-paths";

function fixture(): { dir: string; cleanup: () => void } {
	const dir = mkdtempSync(join(tmpdir(), "dredd-skillpaths-"));
	const agentSkill = join(dir, "agent", "skills", "agent-skill", "SKILL.md");
	const pluginSkill = join(dir, "plugins", "node_modules", "@acme", "acme-pack", "skills", "plugin-skill", "SKILL.md");
	mkdirSync(join(agentSkill, ".."), { recursive: true });
	mkdirSync(join(pluginSkill, ".."), { recursive: true });
	writeFileSync(agentSkill, "# agent\n");
	writeFileSync(pluginSkill, "# plugin\n");
	return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

describe("resolveSkillPath", () => {
	it("finds a skill under the agent skills dir", () => {
		const f = fixture();
		try {
			expect(resolveSkillPath("agent-skill", join(f.dir, "agent"), join(f.dir, "plugins", "node_modules"))).toBe(join(f.dir, "agent", "skills", "agent-skill", "SKILL.md"));
		} finally {
			f.cleanup();
		}
	});

	it("finds a skill under a plugin package's skills dir when the surface strips filePath", () => {
		const f = fixture();
		try {
			expect(resolveSkillPath("plugin-skill", join(f.dir, "agent"), join(f.dir, "plugins", "node_modules"))).toBe(join(f.dir, "plugins", "node_modules", "@acme", "acme-pack", "skills", "plugin-skill", "SKILL.md"));
		} finally {
			f.cleanup();
		}
	});

	it("returns undefined for an unknown skill and a missing plugin root", () => {
		const f = fixture();
		try {
			expect(resolveSkillPath("nope", join(f.dir, "agent"), join(f.dir, "plugins", "node_modules"))).toBeUndefined();
			expect(resolveSkillPath("nope", join(f.dir, "agent"), join(f.dir, "missing-root"))).toBeUndefined();
		} finally {
			f.cleanup();
		}
	});
});
