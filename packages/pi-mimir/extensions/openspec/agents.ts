/**
 * Bundled OpenSpec agents are package-provided, not copied into projects.
 *
 * This module only prunes legacy managed copies recorded by older pi-mimir
 * releases. User-modified legacy copies are preserved and become user-owned.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
	LEGACY_AGENT_MANIFEST,
	readLegacyJson,
	readMimirManagedManifest,
	writeMimirManagedManifest,
} from "./managed-manifest.js";

export const PACKAGE_ROOT = (() => {
	const thisFile = fileURLToPath(import.meta.url);
	return dirname(dirname(dirname(thisFile)));
})();

export const BUNDLED_AGENTS_DIR = join(PACKAGE_ROOT, "agents");

export interface SyncError {
	file?: string;
	op: "read-dest" | "remove" | "manifest-read" | "manifest-write";
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

const MANIFEST_SECTION = "agents";
type Manifest = Record<string, string>;

function sha256(buf: Buffer | string): string {
	return createHash("sha256").update(buf).digest("hex");
}

function coerceManifest(value: unknown): Manifest {
	const out: Manifest = {};
	if (Array.isArray(value)) {
		for (const entry of value) if (typeof entry === "string" && isManagedAgentName(entry)) out[entry] = "";
		return out;
	}
	if (value && typeof value === "object") {
		for (const [key, hash] of Object.entries(value as Record<string, unknown>)) {
			if (typeof key === "string" && typeof hash === "string" && isManagedAgentName(key)) out[key] = hash;
		}
	}
	return out;
}

function readManifest(cwd: string): Manifest {
	const manifest = readMimirManagedManifest(cwd);
	const section = coerceManifest(manifest[MANIFEST_SECTION]);
	if (Object.keys(section).length > 0) return section;
	return coerceManifest(readLegacyJson(cwd, LEGACY_AGENT_MANIFEST));
}

function clearManifest(cwd: string, result: SyncResult): void {
	try {
		const root = readMimirManagedManifest(cwd);
		delete root[MANIFEST_SECTION];
		writeMimirManagedManifest(cwd, root);
	} catch (error) {
		result.errors.push({ op: "manifest-write", message: error instanceof Error ? error.message : String(error) });
	}
}

export function syncBundledAgents(cwd: string): SyncResult {
	const result = emptySyncResult();
	const manifest = readManifest(cwd);
	if (Object.keys(manifest).length === 0) return result;

	const targetDir = join(cwd, ".pi", "agents");
	for (const [name, knownHash] of Object.entries(manifest)) {
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
		} catch (error) {
			result.errors.push({ file: name, op: "read-dest", message: error instanceof Error ? error.message : String(error) });
			continue;
		}
		const destHash = sha256(destContent);
		if (knownHash !== "" && destHash === knownHash) {
			try {
				unlinkSync(destPath);
				result.removed.push(name);
			} catch (error) {
				result.errors.push({ file: name, op: "remove", message: error instanceof Error ? error.message : String(error) });
			}
		}
		// Locally edited legacy files stay on disk and become user-owned.
	}

	clearManifest(cwd, result);
	return result;
}
