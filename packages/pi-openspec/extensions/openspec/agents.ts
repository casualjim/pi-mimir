/**
 * pi-subagents discovers user agents from ~/.pi/agent/agents, not from pi
 * package resource manifests. Keep pi-openspec's OpenSpec role agents there as
 * managed copies so they override the lower-priority pi-subagents builtins.
 *
 * User-modified copies are preserved and become user-owned.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
	LEGACY_AGENT_MANIFEST,
	MANAGED_MANIFEST_NAME,
	readLegacyJson,
	readManagedManifestFile,
	readMimirManagedManifest,
	writeManagedManifestFile,
	writeMimirManagedManifest,
} from "./managed-manifest.js";

export const PACKAGE_ROOT = (() => {
	const thisFile = fileURLToPath(import.meta.url);
	return dirname(dirname(dirname(thisFile)));
})();

export const BUNDLED_AGENTS_DIR = join(PACKAGE_ROOT, "agents");

export interface SyncError {
	file?: string;
	op: "read-dest" | "write-dest" | "remove" | "manifest-read" | "manifest-write";
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

function getAgentRoot(): string {
	const configured = process.env.PI_CODING_AGENT_DIR;
	if (configured === "~") return homedir();
	if (configured?.startsWith("~/")) return join(homedir(), configured.slice(2));
	return configured || join(homedir(), ".pi", "agent");
}

function readProjectLegacyManifest(cwd: string): Manifest {
	const manifest = readMimirManagedManifest(cwd);
	const section = coerceManifest(manifest[MANIFEST_SECTION]);
	if (Object.keys(section).length > 0) return section;
	return coerceManifest(readLegacyJson(cwd, LEGACY_AGENT_MANIFEST));
}

function clearProjectLegacyManifest(cwd: string, result: SyncResult): void {
	try {
		const root = readMimirManagedManifest(cwd);
		delete root[MANIFEST_SECTION];
		writeMimirManagedManifest(cwd, root);
	} catch (error) {
		result.errors.push({ op: "manifest-write", message: error instanceof Error ? error.message : String(error) });
	}
}

function userManifestPath(): string {
	return join(getAgentRoot(), MANAGED_MANIFEST_NAME);
}

function readUserManifest(): Manifest {
	return coerceManifest(readManagedManifestFile(userManifestPath())[MANIFEST_SECTION]);
}

function writeUserManifest(result: SyncResult, manifest: Manifest): void {
	try {
		const root = readManagedManifestFile(userManifestPath());
		if (Object.keys(manifest).length > 0) root[MANIFEST_SECTION] = manifest;
		else delete root[MANIFEST_SECTION];
		writeManagedManifestFile(userManifestPath(), root);
	} catch (error) {
		result.errors.push({ op: "manifest-write", message: error instanceof Error ? error.message : String(error) });
	}
}

function readBundledAgents(): Manifest {
	const out: Manifest = {};
	try {
		for (const entry of readdirSync(BUNDLED_AGENTS_DIR, { withFileTypes: true })) {
			if (!entry.isFile() || !isManagedAgentName(entry.name)) continue;
			out[entry.name] = sha256(readFileSync(join(BUNDLED_AGENTS_DIR, entry.name)));
		}
	} catch {
		return out;
	}
	return out;
}

function copyBundledAgent(name: string, destPath: string, result: SyncResult): boolean {
	try {
		mkdirSync(dirname(destPath), { recursive: true });
		writeFileSync(destPath, readFileSync(join(BUNDLED_AGENTS_DIR, name)));
		return true;
	} catch (error) {
		result.errors.push({ file: name, op: "write-dest", message: error instanceof Error ? error.message : String(error) });
		return false;
	}
}

function removeManagedAgent(targetDir: string, name: string, knownHash: string, result: SyncResult): boolean {
	const destPath = safeJoin(targetDir, name);
	if (destPath === null) {
		result.errors.push({ file: name, op: "remove", message: "rejected unsafe path" });
		return false;
	}
	if (!existsSync(destPath)) {
		result.removed.push(name);
		return true;
	}
	let destContent: Buffer;
	try {
		destContent = readFileSync(destPath);
	} catch (error) {
		result.errors.push({ file: name, op: "read-dest", message: error instanceof Error ? error.message : String(error) });
		return false;
	}
	if (knownHash !== "" && sha256(destContent) === knownHash) {
		try {
			unlinkSync(destPath);
			result.removed.push(name);
			return true;
		} catch (error) {
			result.errors.push({ file: name, op: "remove", message: error instanceof Error ? error.message : String(error) });
			return false;
		}
	}
	// Locally edited files stay on disk and become user-owned.
	return false;
}

function pruneProjectLegacyAgents(cwd: string, result: SyncResult): void {
	const legacyManifest = readProjectLegacyManifest(cwd);
	if (Object.keys(legacyManifest).length === 0) return;
	const targetDir = join(cwd, ".pi", "agents");
	for (const [name, knownHash] of Object.entries(legacyManifest)) {
		removeManagedAgent(targetDir, name, knownHash, result);
	}
	clearProjectLegacyManifest(cwd, result);
}

export function syncBundledAgents(cwd: string): SyncResult {
	const result = emptySyncResult();
	const previousManifest = readUserManifest();
	const bundled = readBundledAgents();
	const nextManifest: Manifest = {};
	const targetDir = join(getAgentRoot(), "agents");

	for (const [name, sourceHash] of Object.entries(bundled)) {
		const destPath = safeJoin(targetDir, name);
		if (destPath === null) {
			result.errors.push({ file: name, op: "remove", message: "rejected unsafe path" });
			continue;
		}

		if (!existsSync(destPath)) {
			if (copyBundledAgent(name, destPath, result)) {
				result.added.push(name);
				nextManifest[name] = sourceHash;
			}
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
		const knownHash = previousManifest[name];
		if (knownHash !== undefined && knownHash !== "" && destHash === knownHash && destHash !== sourceHash) {
			if (copyBundledAgent(name, destPath, result)) {
				result.updated.push(name);
				nextManifest[name] = sourceHash;
			}
			continue;
		}

		if (destHash === sourceHash) {
			result.unchanged.push(name);
			nextManifest[name] = sourceHash;
		}
		// Locally edited user agents stay on disk and become user-owned.
	}

	for (const [name, knownHash] of Object.entries(previousManifest)) {
		if (name in bundled) continue;
		removeManagedAgent(targetDir, name, knownHash, result);
	}

	pruneProjectLegacyAgents(cwd, result);
	writeUserManifest(result, nextManifest);
	return result;
}
