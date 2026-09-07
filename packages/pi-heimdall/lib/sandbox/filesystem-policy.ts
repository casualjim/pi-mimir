import { existsSync, readFileSync } from "node:fs";
import ignore from "ignore";
import { homedir } from "node:os";
import { join, relative, resolve } from "node:path";
import type { SandboxFilesystemPolicy } from "./types.js";

function untildify(path: string): string {
	return path.replace(/^~(?=\/|$)/, homedir());
}

function loadFragmentFile(cwd: string, filename: string): string[] {
	const filepath = join(cwd, filename);
	if (!existsSync(filepath)) return [];
	try {
		return readFileSync(filepath, "utf-8")
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter((line) => line.length > 0 && !line.startsWith("#"));
	} catch {
		return [];
	}
}

/**
 * Last-match-wins prefix matching over absolute/`~`-rooted patterns. A
 * leading `!` negates: the entry un-denies (or un-grants) paths it matches,
 * so `["~/.config", "!~/.config/heimdall"]` keeps heimdall's own config
 * readable while the rest of `~/.config` stays denied. Returns undefined
 * when no absolute pattern matched.
 */
function matchesAbsolutePatterns(patterns: readonly string[], cwd: string, target: string): boolean | undefined {
	let verdict: boolean | undefined;
	for (const pattern of patterns) {
		const negated = pattern.startsWith("!");
		const abs = resolve(cwd, untildify(negated ? pattern.slice(1) : pattern));
		if (target === abs || target.startsWith(`${abs}/`)) {
			verdict = !negated;
		}
	}
	return verdict;
}

export function isDenied(filesystem: SandboxFilesystemPolicy | undefined, cwd: string, rawPath: string): boolean {
	const denyPatterns = [...(filesystem?.deny ?? []), ...loadFragmentFile(cwd, ".heimdall-deny")];
	const target = resolve(cwd, untildify(rawPath));

	const absolute = matchesAbsolutePatterns(denyPatterns, cwd, target);
	if (absolute !== undefined) return absolute;

	const globPatterns = denyPatterns.filter((pattern) => {
		const body = pattern.startsWith("!") ? pattern.slice(1) : pattern;
		return !body.startsWith("/") && !body.startsWith("~");
	});
	if (globPatterns.length > 0) {
		const ig = ignore().add(globPatterns);
		const rel = relative(cwd, target);
		if (rel && !rel.startsWith("..")) {
			return ig.ignores(rel);
		}
	}

	return false;
}

export function isWritable(filesystem: SandboxFilesystemPolicy | undefined, cwd: string, rawPath: string): boolean {
	const writePatterns = [...(filesystem?.writable ?? []), ...loadFragmentFile(cwd, ".heimdall-write")];
	if (writePatterns.length === 0) return false;

	const target = resolve(cwd, untildify(rawPath));

	const absolute = matchesAbsolutePatterns(writePatterns, cwd, target);
	if (absolute !== undefined) return absolute;

	const globPatterns = writePatterns.filter((pattern) => {
		const body = pattern.startsWith("!") ? pattern.slice(1) : pattern;
		return !body.startsWith("/") && !body.startsWith("~");
	});
	if (globPatterns.length > 0) {
		const ig = ignore().add(globPatterns);
		const rel = relative(cwd, target);
		if (rel && !rel.startsWith("..")) {
			return ig.ignores(rel);
		}
	}

	return false;
}
