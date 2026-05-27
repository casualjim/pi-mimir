import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const ADVISOR_MANAGED_MANIFEST = join(".pi", "advisor-managed.json");

export type ManagedManifest = Record<string, Record<string, string>>;

export function readAdvisorManagedManifest(cwd: string): ManagedManifest {
	const manifestPath = join(cwd, ADVISOR_MANAGED_MANIFEST);
	if (!existsSync(manifestPath)) return {};
	try {
		const parsed = JSON.parse(readFileSync(manifestPath, "utf-8"));
		return parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? (parsed as ManagedManifest)
			: {};
	} catch {
		return {};
	}
}

export function writeAdvisorManagedManifest(cwd: string, manifest: ManagedManifest): void {
	const manifestPath = join(cwd, ADVISOR_MANAGED_MANIFEST);
	mkdirSync(dirname(manifestPath), { recursive: true });
	writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
}
