/**
 * pi-hindsight — pi extension wrapping the official hindsight-coding-agents
 * pi.js (imported from the installed dist) to add template-aware recall/
 * reflect tags. See ./core.ts and README.md.
 *
 * Compatibility contract with the official dist (checked at load, loud
 * warnings on mismatch):
 *  - exports `default`: (pi) => void extension factory
 *  - reads HINDSIGHT_CONFIG at runtime for its config
 *  - passes recallOptions through to POST /memories/recall
 *  - recall/reflect are ordinary fetch POSTs whose JSON body accepts
 *    { tags, tags_match } (same fields omp's client sends)
 *  - retainTags templates are resolved by the official plugin itself
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname as dirname2, join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	buildGeneratedConfig,
	buildResolvers,
	installFetchTagInjection,
	resolveProjectLabel,
} from "./core.js";

const TAG = "[pi-hindsight]";
const HARNESS = "pi";
/** Known-good line of the official dist. Newer minors are assumed fine but noted. */
const EXPECTED_MIN_MINOR = 7;

function warn(msg: string) {
	console.error(`${TAG} ${msg}`);
}

function officialDistDir(): string {
	const override = process.env.HINDSIGHT_PI_DIST;
	if (override) return override;
	return join(homedir(), ".hindsight", "coding-agents", "dist");
}

function officialVersion(distDir: string): { version: string; warning?: string } | null {
	const pkgPath = join(distDir, "..", "package.json");
	if (!existsSync(pkgPath)) {
		warn(`no package.json next to ${distDir} — cannot verify official plugin version; proceeding unchecked`);
		return null;
	}
	try {
		const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
		const v = pkg.version ?? "?";
		const m = /^(\d+)\.(\d+)/.exec(v);
		if (!m) return { version: v, warning: `unparseable version "${v}"` };
		const major = Number(m[1]);
		const minor = Number(m[2]);
		if (major !== 0 || minor < EXPECTED_MIN_MINOR) {
			return {
				version: v,
				warning: `official plugin ${v} is outside the tested range (>=0.${EXPECTED_MIN_MINOR}) — recallOptions passthrough may be missing; recall tags may not apply`,
			};
		}
		if (minor > EXPECTED_MIN_MINOR) {
			return { version: v, warning: `official plugin ${v} is newer than the tested 0.${EXPECTED_MIN_MINOR}.x — watch for behavior changes` };
		}
		return { version: v };
	} catch (err) {
		return { version: "?", warning: `could not read official plugin version: ${String(err)}` };
	}
}

function loadUserConfig(): { config: Record<string, unknown>; path: string } | null {
	const explicit = process.env.HINDSIGHT_CONFIG;
	const path = explicit || join(homedir(), ".hindsight", "coding-agent.json");
	if (!existsSync(path)) return null;
	try {
		const parsed = JSON.parse(readFileSync(path, "utf8"));
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			return { config: parsed as Record<string, unknown>, path };
		}
		warn(`config at ${path} is not a JSON object — ignoring it`);
		return null;
	} catch (err) {
		warn(`could not parse config at ${path}: ${String(err)}`);
		return null;
	}
}

function generatedConfigPath(label: string): string {
	const safe = label.replace(/[^a-zA-Z0-9._-]/g, "-");
	return join(process.env.HINDSIGHT_GENERATED_DIR || join(homedir(), ".hindsight", "pi-hindsight"), `${safe}.json`);
}

function writeGeneratedConfig(path: string, config: Record<string, unknown>): boolean {
	const json = `${JSON.stringify(config, null, 2)}\n`;
	if (existsSync(path) && readFileSync(path, "utf8") === json) return true;
	try {
		mkdirSync(dirname2(path), { recursive: true });
		const tmp = `${path}.tmp-${process.pid}`;
		writeFileSync(tmp, json);
		renameSync(tmp, path);
		return true;
	} catch (err) {
		warn(`could not write generated config to ${path}: ${String(err)} — falling back to the user config as-is (recallTags will not apply)`);
		return false;
	}
}

export default async function (pi: ExtensionAPI) {
	const distDir = officialDistDir();
	const officialEntry = join(distDir, "pi.js");
	if (!existsSync(officialEntry)) {
		warn(`official plugin not found at ${officialEntry} — extension is a no-op. Install @vectorize-io/hindsight-coding-agents or set HINDSIGHT_PI_DIST.`);
		return;
	}

	const repoDir = process.cwd();
	const label = resolveProjectLabel(repoDir);
	const resolvers = buildResolvers({ harness: HARNESS, repoDir, projectLabel: label });

	const explicitConfig = process.env.HINDSIGHT_CONFIG;
	if (explicitConfig) {
		warn(`HINDSIGHT_CONFIG is set (${explicitConfig}) — using it verbatim, no recallTags processing`);
	}
	const user = explicitConfig ? null : loadUserConfig();
	let recallTags: string[] = [];
	let recallTagsMatch = "any";
	if (user) {
		const built = buildGeneratedConfig(user.config, resolvers);
		recallTags = built.recallTags;
		recallTagsMatch = built.recallTagsMatch;
		for (const w of built.warnings) warn(w);
		const outPath = generatedConfigPath(label);
		if (writeGeneratedConfig(outPath, built.config)) {
			process.env.HINDSIGHT_CONFIG = outPath;
		}
	}

	const ver = officialVersion(distDir);
	if (ver?.warning) warn(ver.warning);

	const mod = await import(officialEntry);
	const factory = (mod as { default?: unknown }).default;
	if (typeof factory !== "function") {
		warn(
			`official plugin at ${officialEntry} has no default export factory — export shape changed upstream. ` +
				`Recall/reflect tag injection is active, but the official extension was NOT loaded.`,
		);
		return;
	}
	if (recallTags.length > 0) {
		const g = globalThis as { fetch?: unknown };
		if (typeof g.fetch === "function") {
			g.fetch = installFetchTagInjection(g.fetch as never, recallTags, recallTagsMatch) as never;
		} else {
			warn("globalThis.fetch is not a function — cannot install recall/reflect tag injection");
		}
	}

	(factory as (api: ExtensionAPI) => void)(pi);
}
