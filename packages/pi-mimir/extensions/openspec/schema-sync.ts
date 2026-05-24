/**
 * Schema distribution — copies bundled schemas to $XDG_DATA_HOME/openspec/schemas/.
 *
 * Mirrors the agents sync pattern: content-addressable manifest, safe auto-update,
 * user-edit gate, stale cleanup.
 *
 * Target directory follows OpenSpec's tier-2 user-override resolution:
 *   ${XDG_DATA_HOME}/openspec/schemas/<name>/
 *
 * On macOS (no XDG_DATA_HOME): ~/.local/share/openspec/schemas/<name>/
 * On Linux: same, or $XDG_DATA_HOME/openspec/schemas/<name>/
 */

import { createHash } from "node:crypto";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

export const PACKAGE_ROOT = (() => {
	const thisFile = fileURLToPath(import.meta.url);
	return dirname(dirname(dirname(thisFile)));
})();

export const BUNDLED_SCHEMAS_DIR = join(PACKAGE_ROOT, "openspec", "schemas");

export interface SchemaSyncError {
	file?: string;
	op: "read-src" | "read-dest" | "copy" | "remove" | "manifest-read" | "manifest-write" | "mkdir";
	message: string;
}

export interface SchemaSyncResult {
	added: string[];
	updated: string[];
	unchanged: string[];
	removed: string[];
	errors: SchemaSyncError[];
}

const MANIFEST_FILE = ".openspec-managed.json";
type Manifest = Record<string, string>;

function emptySyncResult(): SchemaSyncResult {
	return {
		added: [],
		updated: [],
		unchanged: [],
		removed: [],
		errors: [],
	};
}

function sha256(buf: Buffer | string): string {
	return createHash("sha256").update(buf).digest("hex");
}

/**
 * Returns the global schemas directory ($XDG_DATA_HOME/openspec/schemas/).
 * Mirrors OpenSpec's getGlobalDataDir() resolution.
 */
export function getGlobalSchemasDir(): string {
	const xdg = process.env.XDG_DATA_HOME;
	if (xdg) return join(xdg, "openspec", "schemas");
	return join(homedir(), ".local", "share", "openspec", "schemas");
}

/**
 * Lists bundled schema directory names (e.g. ["review-gated"]).
 */
export function listBundledSchemas(): string[] {
	if (!existsSync(BUNDLED_SCHEMAS_DIR)) return [];
	return readdirSync(BUNDLED_SCHEMAS_DIR, { withFileTypes: true })
		.filter((d) => d.isDirectory() && existsSync(join(BUNDLED_SCHEMAS_DIR, d.name, "schema.yaml")))
		.map((d) => d.name);
}

/**
 * Collects all file paths under a schema directory, relative to that directory.
 */
function collectSchemaFiles(schemaDir: string): string[] {
	const files: string[] = [];
	function walk(dir: string, prefix: string): void {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
			if (entry.isDirectory()) {
				walk(join(dir, entry.name), rel);
			} else if (entry.isFile()) {
				files.push(rel);
			}
		}
	}
	walk(schemaDir, "");
	return files.sort();
}

function readManifest(targetDir: string): Manifest {
	const manifestPath = join(targetDir, MANIFEST_FILE);
	if (!existsSync(manifestPath)) return {};
	try {
		const raw = readFileSync(manifestPath, "utf-8");
		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			const out: Manifest = {};
			for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
				if (typeof k === "string" && typeof v === "string") out[k] = v;
			}
			return out;
		}
		return {};
	} catch {
		return {};
	}
}

function writeManifest(targetDir: string, manifest: Manifest, result: SchemaSyncResult): void {
	const manifestPath = join(targetDir, MANIFEST_FILE);
	try {
		const ordered: Manifest = {};
		for (const k of Object.keys(manifest).sort()) ordered[k] = manifest[k] ?? "";
		writeFileSync(manifestPath, `${JSON.stringify(ordered, null, 2)}\n`, "utf-8");
	} catch (e) {
		result.errors.push({ op: "manifest-write", message: e instanceof Error ? e.message : String(e) });
	}
}

/**
 * Sync a single bundled schema to the target directory.
 *
 * @param schemaName - e.g. "review-gated"
 * @param targetDir - the parent directory (e.g. $XDG_DATA_HOME/openspec/schemas/)
 * @param apply - true to overwrite user-edited files, false for read-only drift detection
 */
function syncSingleSchema(schemaName: string, targetDir: string): SchemaSyncResult {
	const result = emptySyncResult();
	const srcDir = join(BUNDLED_SCHEMAS_DIR, schemaName);
	const destDir = join(targetDir, schemaName);

	if (!existsSync(srcDir)) return result;

	try {
		mkdirSync(destDir, { recursive: true });
	} catch (e) {
		result.errors.push({ op: "mkdir", message: e instanceof Error ? e.message : String(e) });
		return result;
	}

	const sourceFiles = collectSchemaFiles(srcDir);
	const sourceNames = new Set(sourceFiles);
	const manifest = readManifest(destDir);
	const newManifest: Manifest = {};

	for (const relPath of sourceFiles) {
		const src = join(srcDir, relPath);
		const dest = join(destDir, relPath);
		const knownHash = manifest[relPath] ?? "";

		// Ensure parent directories exist
		const parentDir = dirname(dest);
		if (!existsSync(parentDir)) {
			try {
				mkdirSync(parentDir, { recursive: true });
			} catch (e) {
				result.errors.push({ op: "mkdir", message: e instanceof Error ? e.message : String(e) });
				newManifest[relPath] = knownHash;
				continue;
			}
		}

		let srcContent: Buffer;
		try {
			srcContent = readFileSync(src);
		} catch (e) {
			result.errors.push({ file: relPath, op: "read-src", message: e instanceof Error ? e.message : String(e) });
			newManifest[relPath] = knownHash;
			continue;
		}
		const srcHash = sha256(srcContent);

		if (!existsSync(dest)) {
			try {
				copyFileSync(src, dest);
				result.added.push(relPath);
				newManifest[relPath] = srcHash;
			} catch (e) {
				result.errors.push({ file: relPath, op: "copy", message: e instanceof Error ? e.message : String(e) });
				newManifest[relPath] = knownHash;
			}
			continue;
		}

		let destContent: Buffer;
		try {
			destContent = readFileSync(dest);
		} catch (e) {
			result.errors.push({ file: relPath, op: "read-dest", message: e instanceof Error ? e.message : String(e) });
			newManifest[relPath] = knownHash;
			continue;
		}
		const destHash = sha256(destContent);

		if (srcHash === destHash) {
			result.unchanged.push(relPath);
			newManifest[relPath] = srcHash;
			continue;
		}

		// Safe auto-update: dest still matches what we recorded (user hasn't edited)
		const safeAutoUpdate = knownHash !== "" && destHash === knownHash;
		if (safeAutoUpdate) {
			try {
				copyFileSync(src, dest);
				result.updated.push(relPath);
				newManifest[relPath] = srcHash;
			} catch (e) {
				result.errors.push({ file: relPath, op: "copy", message: e instanceof Error ? e.message : String(e) });
				newManifest[relPath] = knownHash;
			}
		}
		// Locally edited managed files are left on disk and removed from the manifest;
		// they are now user-owned rather than managed drift.
	}

	// Clean up stale files (present in manifest but no longer in source)
	for (const name of Object.keys(manifest)) {
		if (sourceNames.has(name)) continue;
		if (name === MANIFEST_FILE) continue; // never remove our own manifest
		const knownHash = manifest[name] ?? "";
		const destPath = join(destDir, name);

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
		const safeAutoRemove = knownHash !== "" && destHash === knownHash;

		if (safeAutoRemove) {
			try {
				unlinkSync(destPath);
				result.removed.push(name);
			} catch (e) {
				result.errors.push({ file: name, op: "remove", message: e instanceof Error ? e.message : String(e) });
				newManifest[name] = knownHash;
			}
		}
		// Locally edited stale files are left on disk and removed from the manifest;
		// they are now user-owned rather than managed drift.
	}

	writeManifest(destDir, newManifest, result);
	return result;
}

/**
 * Sync all bundled schemas to the global schemas directory.
 *
 * @param apply - true to overwrite user-edited files, false for read-only drift detection
 */
export function syncBundledSchemas(): SchemaSyncResult {
	const result = emptySyncResult();
	const globalDir = getGlobalSchemasDir();

	try {
		mkdirSync(globalDir, { recursive: true });
	} catch (e) {
		result.errors.push({ op: "mkdir", message: e instanceof Error ? e.message : String(e) });
		return result;
	}

	for (const schemaName of listBundledSchemas()) {
		const single = syncSingleSchema(schemaName, globalDir);
		// Prefix file names with schema name for clarity in reports
		for (const f of single.added) result.added.push(`${schemaName}/${f}`);
		for (const f of single.updated) result.updated.push(`${schemaName}/${f}`);
		for (const f of single.unchanged) result.unchanged.push(`${schemaName}/${f}`);
		for (const f of single.removed) result.removed.push(`${schemaName}/${f}`);
		for (const e of single.errors) result.errors.push(e);
	}

	return result;
}
