import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { PACKAGE_ROOT } from "./agents.js";

export type OpenSpecAssetKind = "schema" | "config" | "generated OpenSpec asset";

export interface OpenSpecAssetEntry {
	targetPath: string;
	sourceAssetKind: OpenSpecAssetKind;
	sourceAssetId: string;
	openspecVersion: string;
	sourceAssetVersion: string;
	contentHash: string;
	lastGeneratedAt: string;
}

const MANIFEST = ".openspec-assets-managed.json";
// OpenSpec assets can be generated from schema/template/config versions in addition to source bytes.
// Static agents/skills/prompts remain content-addressable in their own manifests and are not tracked here.
const OPENSPEC_VERSION = "not-captured-static-package-asset";
const SOURCE_ASSET_VERSION = "1";

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

function entry(kind: OpenSpecAssetKind, source: string, targetPath: string): OpenSpecAssetEntry | null {
	try {
		return {
			targetPath,
			sourceAssetKind: kind,
			sourceAssetId: relative(PACKAGE_ROOT, source).split("/").join("/"),
			openspecVersion: OPENSPEC_VERSION,
			sourceAssetVersion: SOURCE_ASSET_VERSION,
			contentHash: sha256(readFileSync(source)),
			lastGeneratedAt: new Date().toISOString(),
		};
	} catch {
		return null;
	}
}

export function collectOpenSpecAssetEntries(): Record<string, OpenSpecAssetEntry> {
	const entries: Record<string, OpenSpecAssetEntry> = {};
	for (const file of walk(join(PACKAGE_ROOT, "openspec", "schemas"))) {
		const target = `openspec/schemas/${relative(join(PACKAGE_ROOT, "openspec", "schemas"), file)}`;
		const e = entry("schema", file, target);
		if (e) entries[target] = e;
	}
	for (const file of walk(join(PACKAGE_ROOT, "openspec", "config"))) {
		const target = `openspec/config/${relative(join(PACKAGE_ROOT, "openspec", "config"), file)}`;
		const e = entry("config", file, target);
		if (e) entries[target] = e;
	}
	return entries;
}

function readManifest(cwd: string): Record<string, Partial<OpenSpecAssetEntry>> {
	const path = join(cwd, MANIFEST);
	if (!existsSync(path)) return {};
	try {
		const parsed = JSON.parse(readFileSync(path, "utf-8"));
		return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
	} catch {
		return {};
	}
}

export function writeOpenSpecAssetManifest(cwd: string): void {
	const entries = collectOpenSpecAssetEntries();
	writeFileSync(join(cwd, MANIFEST), `${JSON.stringify(entries, null, 2)}\n`, "utf-8");
}

export function findStaleOpenSpecAssets(cwd: string): string[] {
	const current = collectOpenSpecAssetEntries();
	const installed = readManifest(cwd);
	const stale: string[] = [];
	for (const [target, entry] of Object.entries(current)) {
		const old = installed[target];
		if (!old) continue;
		if (
			old.openspecVersion !== entry.openspecVersion ||
			old.sourceAssetVersion !== entry.sourceAssetVersion ||
			old.contentHash !== entry.contentHash ||
			old.sourceAssetKind !== entry.sourceAssetKind
		) stale.push(target);
	}
	return stale.sort();
}
