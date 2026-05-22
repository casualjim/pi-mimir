import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const MIMIR_MANAGED_MANIFEST = join(".pi", "mimir-managed.json");
export const LEGACY_ROOT_ASSET_MANIFEST = ".openspec-assets-managed.json";
export const LEGACY_AGENT_MANIFEST = join(".pi", "agents", ".openspec-managed.json");

type ManagedManifest = Record<string, unknown>;

export function readMimirManagedManifest(cwd: string): ManagedManifest {
	const manifestPath = join(cwd, MIMIR_MANAGED_MANIFEST);
	if (!existsSync(manifestPath)) return {};
	try {
		const parsed = JSON.parse(readFileSync(manifestPath, "utf-8"));
		return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as ManagedManifest : {};
	} catch {
		return {};
	}
}

export function writeMimirManagedManifest(cwd: string, manifest: ManagedManifest): void {
	const manifestPath = join(cwd, MIMIR_MANAGED_MANIFEST);
	mkdirSync(dirname(manifestPath), { recursive: true });
	writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
	removeLegacyManagedManifests(cwd);
}

export function readLegacyJson(cwd: string, legacyPath: string): unknown {
	const path = join(cwd, legacyPath);
	if (!existsSync(path)) return undefined;
	try {
		return JSON.parse(readFileSync(path, "utf-8"));
	} catch {
		return undefined;
	}
}

export function removeLegacyManagedManifests(cwd: string): void {
	for (const legacyPath of [LEGACY_ROOT_ASSET_MANIFEST, LEGACY_AGENT_MANIFEST]) {
		try {
			const path = join(cwd, legacyPath);
			if (existsSync(path)) unlinkSync(path);
		} catch {
			// Best-effort cleanup only; callers should not fail because a stale legacy
			// marker is locked or otherwise temporarily unavailable.
		}
	}
}
