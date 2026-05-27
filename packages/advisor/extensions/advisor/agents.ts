import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { readAdvisorManagedManifest, writeAdvisorManagedManifest } from "./managed-manifest.js";

export const PACKAGE_ROOT = (() => {
	const thisFile = fileURLToPath(import.meta.url);
	return dirname(dirname(dirname(thisFile)));
})();

export const BUNDLED_AGENTS_DIR = join(PACKAGE_ROOT, "agents");
export const MANIFEST_SECTION = "agents";

type Manifest = Record<string, string>;

export interface SyncError {
	file?: string;
	op: "read-src" | "read-dest" | "copy" | "remove" | "manifest-write" | "mkdir";
	message: string;
}

export interface SyncResult {
	added: string[];
	updated: string[];
	unchanged: string[];
	removed: string[];
	errors: SyncError[];
}

function emptySyncResult(): SyncResult {
	return { added: [], updated: [], unchanged: [], removed: [], errors: [] };
}

function isManagedAgentName(name: string): boolean {
	if (typeof name !== "string" || name.length === 0) return false;
	if (name.includes("\0")) return false;
	if (name.includes("/") || name.includes("\\")) return false;
	if (name === "." || name === "..") return false;
	if (name.includes("..")) return false;
	if (isAbsolute(name)) return false;
	return name.endsWith(".md");
}

function safeJoin(targetDir: string, name: string): string | null {
	const resolved = resolve(targetDir, name);
	const root = resolve(targetDir) + sep;
	return resolved.startsWith(root) ? resolved : null;
}

function sha256(buf: Buffer | string): string {
	return createHash("sha256").update(buf).digest("hex");
}

function coerceManifest(value: unknown): Manifest {
	const out: Manifest = {};
	if (!value || typeof value !== "object" || Array.isArray(value)) return out;
	for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
		if (typeof k === "string" && typeof v === "string" && isManagedAgentName(k)) out[k] = v;
	}
	return out;
}

function readManifest(cwd: string): Manifest {
	const manifest = readAdvisorManagedManifest(cwd);
	return coerceManifest(manifest[MANIFEST_SECTION]);
}

function writeManifest(cwd: string, manifest: Manifest, result: SyncResult): void {
	try {
		const root = readAdvisorManagedManifest(cwd);
		const ordered: Manifest = {};
		for (const key of Object.keys(manifest).sort()) ordered[key] = manifest[key] ?? "";
		root[MANIFEST_SECTION] = ordered;
		writeAdvisorManagedManifest(cwd, root);
	} catch (error) {
		result.errors.push({ op: "manifest-write", message: error instanceof Error ? error.message : String(error) });
	}
}

export function syncBundledAgents(cwd: string): SyncResult {
	const result = emptySyncResult();
	if (!existsSync(BUNDLED_AGENTS_DIR)) return result;

	const targetDir = join(cwd, ".pi", "agents");
	try {
		mkdirSync(targetDir, { recursive: true });
	} catch (error) {
		result.errors.push({ op: "mkdir", message: error instanceof Error ? error.message : "Failed to create target directory" });
		return result;
	}

	let sourceEntries: string[];
	try {
		sourceEntries = readdirSync(BUNDLED_AGENTS_DIR).filter((file) => file.endsWith(".md"));
	} catch {
		result.errors.push({ op: "read-src", message: "Failed to read bundled agents directory" });
		return result;
	}

	const sourceNames = new Set(sourceEntries);
	const manifest = readManifest(cwd);
	const nextManifest: Manifest = {};

	for (const entry of sourceEntries) {
		const src = join(BUNDLED_AGENTS_DIR, entry);
		const dest = safeJoin(targetDir, entry);
		const knownHash = manifest[entry] ?? "";
		if (dest === null) {
			result.errors.push({ file: entry, op: "copy", message: "rejected unsafe path" });
			nextManifest[entry] = knownHash;
			continue;
		}

		let srcContent: Buffer;
		try {
			srcContent = readFileSync(src);
		} catch (error) {
			result.errors.push({ file: entry, op: "read-src", message: error instanceof Error ? error.message : String(error) });
			nextManifest[entry] = knownHash;
			continue;
		}
		const srcHash = sha256(srcContent);

		if (!existsSync(dest)) {
			try {
				copyFileSync(src, dest);
				result.added.push(entry);
				nextManifest[entry] = srcHash;
			} catch (error) {
				result.errors.push({ file: entry, op: "copy", message: error instanceof Error ? error.message : String(error) });
				nextManifest[entry] = knownHash;
			}
			continue;
		}

		let destContent: Buffer;
		try {
			destContent = readFileSync(dest);
		} catch (error) {
			result.errors.push({ file: entry, op: "read-dest", message: error instanceof Error ? error.message : String(error) });
			nextManifest[entry] = knownHash;
			continue;
		}
		const destHash = sha256(destContent);

		if (srcHash === destHash) {
			result.unchanged.push(entry);
			nextManifest[entry] = srcHash;
			continue;
		}

		const safeAutoUpdate = knownHash !== "" && destHash === knownHash;
		if (safeAutoUpdate) {
			try {
				copyFileSync(src, dest);
				result.updated.push(entry);
				nextManifest[entry] = srcHash;
			} catch (error) {
				result.errors.push({ file: entry, op: "copy", message: error instanceof Error ? error.message : String(error) });
				nextManifest[entry] = knownHash;
			}
		}
	}

	for (const name of Object.keys(manifest)) {
		if (sourceNames.has(name)) continue;
		const knownHash = manifest[name] ?? "";
		const dest = safeJoin(targetDir, name);
		if (dest === null) {
			result.errors.push({ file: name, op: "remove", message: "rejected unsafe path" });
			continue;
		}
		if (!existsSync(dest)) {
			result.removed.push(name);
			continue;
		}
		let destContent: Buffer;
		try {
			destContent = readFileSync(dest);
		} catch (error) {
			result.errors.push({ file: name, op: "read-dest", message: error instanceof Error ? error.message : String(error) });
			nextManifest[name] = knownHash;
			continue;
		}
		const destHash = sha256(destContent);
		const safeAutoRemove = knownHash !== "" && destHash === knownHash;
		if (safeAutoRemove) {
			try {
				unlinkSync(dest);
				result.removed.push(name);
			} catch (error) {
				result.errors.push({ file: name, op: "remove", message: error instanceof Error ? error.message : String(error) });
				nextManifest[name] = knownHash;
			}
		}
	}

	writeManifest(cwd, nextManifest, result);
	return result;
}
