/**
 * Pure core for pi-hindsight: template resolution, config generation, fetch
 * tag injection. No pi imports — unit-testable in isolation.
 *
 * Wraps the official hindsight-coding-agents pi.js. The official plugin
 * resolves templates only for bankIdTemplate / retainTags / retainMetadata;
 * recall (recallObservations) and reflect ship tags untouched, so a shared
 * bank either recalls everything (no filter) or needs one static config per
 * repo. This wrapper closes that gap: it adds `recallTags` / `recallTagsMatch`
 * config keys (template-aware), bakes them into a generated config handed to
 * the official plugin via HINDSIGHT_CONFIG, and injects the resolved tags
 * into /memories/recall and /reflect request bodies at the fetch layer.
 */

import { execFileSync } from "node:child_process";
import { basename, dirname } from "node:path";

const TAG = "[pi-hindsight]";

/** Semantics mirror the official plugin's gitProjectName: basename of the
 *  main worktree root; falls back to the cwd basename outside a repo. */
export function resolveProjectLabel(cwd: string, run: typeof execFileSync = execFileSync): string {
	try {
		const commonDir = run("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
			cwd,
			encoding: "utf8",
		}) as string;
		const dir = commonDir.trim();
		if (!dir) return basename(cwd);
		// Regular repo: <root>/.git — take the parent. Bare repo: the common dir itself is the root.
		return basename(dir) === ".git" ? basename(dirname(dir)) : basename(dir);
	} catch {
		return basename(cwd);
	}
}

export interface TemplateResolvers {
	[name: string]: () => string;
}

export function buildResolvers(opts: {
	harness: string;
	repoDir: string;
	projectLabel: string;
}): TemplateResolvers {
	return {
		harness: () => opts.harness,
		project: () => basename(opts.repoDir),
		gitProject: () => opts.projectLabel,
		gitProjectLower: () => opts.projectLabel.toLowerCase(),
		channel: () => process.env.HINDSIGHT_CHANNEL_ID || "default",
		user: () => process.env.HINDSIGHT_USER_ID || "anonymous",
	};
}

export function resolveTemplate(template: string, resolvers: TemplateResolvers): string {
	return template.replace(/\{([a-zA-Z]+)\}/g, (_whole, name: string) => {
		const resolve = resolvers[name];
		if (!resolve) {
			console.error(
				`${TAG} unknown template placeholder "{${name}}" in recallTags — valid: ` +
					Object.keys(resolvers).sort((a, b) => a.localeCompare(b)).map((k) => `{${k}}`).join(", "),
			);
			return "unknown";
		}
		return resolve();
	});
}

/** Keys this wrapper owns; stripped before the config reaches the official plugin. */
export const WRAPPER_KEYS = ["recallTags", "recallTagsMatch"] as const;

export interface BuildResult {
	/** Config to hand to the official plugin (our keys removed, recallOptions baked). */
	config: Record<string, unknown>;
	/** Resolved recall tags actually in effect (empty = no injection). */
	recallTags: string[];
	recallTagsMatch: string;
	warnings: string[];
}

export function buildGeneratedConfig(
	userConfig: Record<string, unknown>,
	resolvers: TemplateResolvers,
): BuildResult {
	const warnings: string[] = [];
	// {gitProjectLower} is not an official retainTags placeholder — pre-resolve it so the
	// official plugin never sees it and warns. Other placeholders pass through untouched.
	const lower = resolvers.gitProjectLower ? resolvers.gitProjectLower() : "";
	const retainTags = Array.isArray(userConfig.retainTags)
		? (userConfig.retainTags as unknown[]).map((t) =>
				typeof t === "string" ? t.replace(/\{gitProjectLower\}/g, lower) : t,
			)
		: undefined;
	const recallTagTemplates = Array.isArray(userConfig.recallTags)
		? (userConfig.recallTags as unknown[]).filter((t): t is string => typeof t === "string" && t.trim() !== "")
		: [];
	const match = typeof userConfig.recallTagsMatch === "string" && userConfig.recallTagsMatch.trim() !== ""
		? userConfig.recallTagsMatch.trim()
		: "any";

	const recallTags = [...new Set(recallTagTemplates.map((t) => resolveTemplate(t, resolvers).trim()))].filter(Boolean);

	const userRecallOptions =
		userConfig.recallOptions && typeof userConfig.recallOptions === "object" && !Array.isArray(userConfig.recallOptions)
			? (userConfig.recallOptions as Record<string, unknown>)
			: {};
	if (userRecallOptions.tags !== undefined && recallTagTemplates.length > 0) {
		warnings.push(
			`config sets both recallOptions.tags and recallTags — recallOptions.tags wins, recallTags ignored`,
		);
	}

	const config: Record<string, unknown> = { ...userConfig };
	for (const key of WRAPPER_KEYS) delete config[key];
	if (retainTags !== undefined) config.retainTags = retainTags;
	// Explicit user tags win wholesale (their object, verbatim); ours only fill the gap.
	config.recallOptions =
		userRecallOptions.tags !== undefined
			? { ...userRecallOptions }
			: { tags: recallTags, tags_match: match, ...userRecallOptions };

	return { config, recallTags, recallTagsMatch: match, warnings };
}

type FetchLike = (input: unknown, init?: unknown) => Promise<unknown>;

function requestUrlOf(input: unknown): string {
	if (typeof input === "string") return input;
	if (input instanceof URL) return input.href;
	const url = (input as Request | undefined)?.url;
	return typeof url === "string" ? url : "";
}

/** Tags for POSTs to /memories/recall and /reflect unless the body already
 *  has some. Returns the (possibly rewritten) init. Interception failures are
 *  reported on stderr and never break the underlying call. */
export function injectTagsIntoInit(
	input: unknown,
	init: RequestInit | undefined,
	recallTags: string[],
	match: string,
): RequestInit | undefined {
	if (recallTags.length === 0) return init;
	const body = init?.body;
	if (typeof body !== "string") return init;
	let pathname: string;
	try {
		pathname = new URL(requestUrlOf(input)).pathname;
	} catch (err) {
		console.error(`${TAG} could not parse request URL for tag injection: ${String(err)}`);
		return init;
	}
	if (!/\/memories\/recall$|\/reflect$/.test(pathname)) return init;
	let parsed: Record<string, unknown>;
	try {
		parsed = JSON.parse(body) as Record<string, unknown>;
	} catch (err) {
		console.error(`${TAG} recall/reflect body was not JSON, skipping tag injection: ${String(err)}`);
		return init;
	}
	const existing = Array.isArray(parsed.tags) ? parsed.tags.length : 0;
	if (existing > 0) return init;
	parsed.tags = recallTags;
	parsed.tags_match = match;
	return { ...init, body: JSON.stringify(parsed) };
}

/** Wrap globalThis.fetch so POSTs to /memories/recall and /reflect carry the
 *  resolved tags unless the body already has some. Idempotent. */
export function installFetchTagInjection(fetchImpl: FetchLike, recallTags: string[], match: string): FetchLike {
	const f = fetchImpl as FetchLike & { __piHindsightTagged?: boolean };
	if (f.__piHindsightTagged) return f;
	const wrapped: FetchLike = async (input, init) => {
		const patchedInit = injectTagsIntoInit(input, init as RequestInit | undefined, recallTags, match);
		return fetchImpl(input, patchedInit);
	};
	(wrapped as FetchLike & { __piHindsightTagged?: boolean }).__piHindsightTagged = true;
	return wrapped;
}
