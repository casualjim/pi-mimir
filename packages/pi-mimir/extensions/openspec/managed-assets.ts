import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { PACKAGE_ROOT } from "./agents.js";
import {
	LEGACY_ROOT_ASSET_MANIFEST,
	readLegacyJson,
	readMimirManagedManifest,
	removeLegacyManagedManifests,
	writeMimirManagedManifest,
} from "./managed-manifest.js";

const MANIFEST_SECTION = "openSpecAssets";
type HashManifest = Record<string, string>;

function sha256(content: string | Buffer): string {
	return createHash("sha256").update(content).digest("hex");
}

function walk(dir: string): string[] {
	if (!existsSync(dir)) return [];
	const out: string[] = [];
	for (const name of readdirSync(dir, { withFileTypes: true })) {
		const p = join(dir, name.name);
		if (name.isDirectory()) out.push(...walk(p));
		else out.push(p);
	}
	return out.sort();
}

function addAssetEntry(entries: HashManifest, root: string, prefix: string, file: string): void {
	const target = `${prefix}/${relative(root, file).split("\\").join("/")}`;
	entries[target] = sha256(readFileSync(file));
}

export function collectOpenSpecAssetEntries(): HashManifest {
	const entries: HashManifest = {};
	const schemasRoot = join(PACKAGE_ROOT, "openspec", "schemas");
	for (const file of walk(schemasRoot)) addAssetEntry(entries, schemasRoot, "openspec/schemas", file);
	const configRoot = join(PACKAGE_ROOT, "openspec", "config");
	for (const file of walk(configRoot)) addAssetEntry(entries, configRoot, "openspec/config", file);
	return orderHashManifest(entries);
}

function coerceAssetManifest(value: unknown): HashManifest {
	const out: HashManifest = {};
	if (!value || typeof value !== "object" || Array.isArray(value)) return out;
	for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
		if (typeof entry === "string") out[key] = entry;
		else if (entry && typeof entry === "object") {
			const legacyHash = (entry as { contentHash?: unknown }).contentHash;
			if (typeof legacyHash === "string") out[key] = legacyHash;
		}
	}
	return out;
}

function readManifest(cwd: string): HashManifest {
	const manifest = readMimirManagedManifest(cwd);
	const section = coerceAssetManifest(manifest[MANIFEST_SECTION]);
	if (Object.keys(section).length > 0) {
		removeLegacyManagedManifests(cwd);
		return section;
	}
	return coerceAssetManifest(readLegacyJson(cwd, LEGACY_ROOT_ASSET_MANIFEST));
}

export function writeOpenSpecAssetManifest(cwd: string): void {
	const manifest = readMimirManagedManifest(cwd);
	manifest[MANIFEST_SECTION] = collectOpenSpecAssetEntries();
	writeMimirManagedManifest(cwd, manifest);
}

export function findStaleOpenSpecAssets(cwd: string): string[] {
	const current = collectOpenSpecAssetEntries();
	const installed = readManifest(cwd);
	const stale: string[] = [];
	for (const [target, hash] of Object.entries(current)) {
		const oldHash = installed[target];
		if (!oldHash) continue;
		if (oldHash !== hash) stale.push(target);
	}
	return stale.sort();
}

function orderHashManifest(manifest: HashManifest): HashManifest {
	const ordered: HashManifest = {};
	for (const key of Object.keys(manifest).sort()) ordered[key] = manifest[key] ?? "";
	return ordered;
}
