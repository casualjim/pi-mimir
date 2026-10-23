/**
 * Skill file resolution when the host surface omits filePath (omp's
 * extension adapter strips it): look the SKILL.md up by name under the
 * host's skill roots — the agent skills dir and each plugin package's
 * skills dir.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export function resolveSkillPath(name: string, agentDir: string, pluginRoot: string | undefined): string | undefined {
	const direct = join(agentDir, "skills", name, "SKILL.md");
	if (existsSync(direct)) return direct;
	if (!pluginRoot) return undefined;
	let publishers: string[];
	try {
		publishers = readdirSync(pluginRoot);
	} catch (error) {
		if (!isEnoent(error)) throw error;
		return undefined;
	}
	for (const publisher of publishers) {
		const publisherDir = join(pluginRoot, publisher);
		let packages: string[];
		try {
			packages = readdirSync(publisherDir);
		} catch (error) {
			if (!isEnoent(error)) throw error;
			continue;
		}
		for (const pkg of packages) {
			const candidate = join(publisherDir, pkg, "skills", name, "SKILL.md");
			if (existsSync(candidate)) return candidate;
		}
	}
	return undefined;
}

function isEnoent(error: unknown): boolean {
	return error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT";
}
