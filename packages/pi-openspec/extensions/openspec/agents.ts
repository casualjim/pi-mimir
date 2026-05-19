/**
 * Agent auto-copy — copies bundled agents into <cwd>/.pi/agents/.
 *
 * Pure utility. No ExtensionAPI interactions.
 *
 * Manifest-based ownership with content-addressable sha256 hashing and path-traversal hardening.
 */

import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const PACKAGE_ROOT = (() => {
	const thisFile = fileURLToPath(import.meta.url);
	return dirname(dirname(dirname(thisFile)));
})();

export const BUNDLED_AGENTS_DIR = join(PACKAGE_ROOT, "agents");

export interface SyncError {
	file?: string;
	op: "read-src" | "read-dest" | "copy" | "remove" | "manifest-read" | "manifest-write" | "mkdir";
	message: string;
}

export interface SyncResult {
	added: string[];
	updated: string[];
	unchanged: string[];
	removed: string[];
	pendingUpdate: string[];
	pendingRemove: string[];
	errors: SyncError[];
}

function emptySyncResult(): SyncResult {
	return { added: [], updated: [], unchanged: [], removed: [], pendingUpdate: [], pendingRemove: [], errors: [] };
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

const MANIFEST_FILE = ".openspec-managed.json";
type Manifest = Record<string, string>;

function sha256(buf: Buffer | string): string {
	return createHash("sha256").update(buf).digest("hex");
}

function readManifest(targetDir: string): Manifest {
	const manifestPath = join(targetDir, MANIFEST_FILE);
	if (!existsSync(manifestPath)) return {};
	try {
		const raw = readFileSync(manifestPath, "utf-8");
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed)) {
			const out: Manifest = {};
			for (const e of parsed) if (typeof e === "string" && isManagedAgentName(e)) out[e] = "";
			return out;
		}
		if (parsed && typeof parsed === "object") {
			const out: Manifest = {};
			for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
				if (typeof k === "string" && typeof v === "string" && isManagedAgentName(k)) out[k] = v;
			}
			return out;
		}
		return {};
	} catch {
		return {};
	}
}

function writeManifest(targetDir: string, manifest: Manifest, result: SyncResult): void {
	const manifestPath = join(targetDir, MANIFEST_FILE);
	try {
		const ordered: Manifest = {};
		for (const k of Object.keys(manifest).sort()) ordered[k] = manifest[k] ?? "";
		writeFileSync(manifestPath, `${JSON.stringify(ordered, null, 2)}\n`, "utf-8");
	} catch (e) {
		result.errors.push({ op: "manifest-write", message: e instanceof Error ? e.message : String(e) });
	}
}

export function syncBundledAgents(cwd: string, apply: boolean): SyncResult {
	const result = emptySyncResult();
	if (!existsSync(BUNDLED_AGENTS_DIR)) return result;

	const targetDir = join(cwd, ".pi", "agents");
	try {
		mkdirSync(targetDir, { recursive: true });
	} catch (e) {
		result.errors.push({ op: "mkdir", message: e instanceof Error ? e.message : "Failed to create target directory" });
		return result;
	}

	let sourceEntries: string[];
	try {
		sourceEntries = readdirSync(BUNDLED_AGENTS_DIR).filter((f) => f.endsWith(".md"));
	} catch {
		result.errors.push({ op: "read-src", message: "Failed to read bundled agents directory" });
		return result;
	}

	const sourceNames = new Set(sourceEntries);
	const manifest = readManifest(targetDir);
	const newManifest: Manifest = {};

	for (const entry of sourceEntries) {
		const src = join(BUNDLED_AGENTS_DIR, entry);
		const dest = safeJoin(targetDir, entry);
		const knownHash = manifest[entry] ?? "";
		if (dest === null) {
			result.errors.push({ file: entry, op: "copy", message: "rejected unsafe path" });
			newManifest[entry] = knownHash;
			continue;
		}

		let srcContent: Buffer;
		try {
			srcContent = readFileSync(src);
		} catch (e) {
			result.errors.push({ file: entry, op: "read-src", message: e instanceof Error ? e.message : String(e) });
			newManifest[entry] = knownHash;
			continue;
		}
		const srcHash = sha256(srcContent);

		if (!existsSync(dest)) {
			try {
				copyFileSync(src, dest);
				result.added.push(entry);
				newManifest[entry] = srcHash;
			} catch (e) {
				result.errors.push({ file: entry, op: "copy", message: e instanceof Error ? e.message : String(e) });
				newManifest[entry] = knownHash;
			}
			continue;
		}

		let destContent: Buffer;
		try {
			destContent = readFileSync(dest);
		} catch (e) {
			result.errors.push({ file: entry, op: "read-dest", message: e instanceof Error ? e.message : String(e) });
			newManifest[entry] = knownHash;
			continue;
		}
		const destHash = sha256(destContent);

		if (srcHash === destHash) {
			result.unchanged.push(entry);
			newManifest[entry] = srcHash;
			continue;
		}

		const safeAutoUpdate = !apply && knownHash !== "" && destHash === knownHash;
		if (apply || safeAutoUpdate) {
			try {
				copyFileSync(src, dest);
				result.updated.push(entry);
				newManifest[entry] = srcHash;
			} catch (e) {
				result.errors.push({ file: entry, op: "copy", message: e instanceof Error ? e.message : String(e) });
				newManifest[entry] = knownHash;
			}
		} else {
			result.pendingUpdate.push(entry);
			newManifest[entry] = knownHash;
		}
	}

	const toUnlink: { name: string; destPath: string }[] = [];
	for (const name of Object.keys(manifest)) {
		if (sourceNames.has(name)) continue;
		const knownHash = manifest[name] ?? "";
		const destPath = safeJoin(targetDir, name);
		if (destPath === null) {
			result.errors.push({ file: name, op: "remove", message: "rejected unsafe path" });
			continue;
		}
		if (!existsSync(destPath)) {
			result.removed.push(name);
			continue;
		}

		let destContent: Buffer;
		try {
			destContent = readFileSync(destPath);
		} catch (e) {
			result.errors.push({ file: name, op: "read-dest", message: e instanceof Error ? e.message : String(e) });
			newManifest[name] = knownHash;
			continue;
		}
		const destHash = sha256(destContent);
		const safeAutoRemove = !apply && knownHash !== "" && destHash === knownHash;

		if (apply || safeAutoRemove) toUnlink.push({ name, destPath });
		else {
			result.pendingRemove.push(name);
			newManifest[name] = knownHash;
		}
	}

	writeManifest(targetDir, newManifest, result);
	for (const { name, destPath } of toUnlink) {
		try {
			unlinkSync(destPath);
			result.removed.push(name);
		} catch (e) {
			result.errors.push({ file: name, op: "remove", message: e instanceof Error ? e.message : String(e) });
			newManifest[name] = manifest[name] ?? "";
		}
	}
	if (result.errors.some((e) => e.op === "remove")) writeManifest(targetDir, newManifest, result);
	return result;
}
