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

export function isDenied(filesystem: SandboxFilesystemPolicy | undefined, cwd: string, rawPath: string): boolean {
	const denyPatterns = [...(filesystem?.deny ?? []), ...loadFragmentFile(cwd, ".heimdall-deny")];
	const expandedPatterns = denyPatterns.map((pattern) => resolve(cwd, untildify(pattern)));
	const target = resolve(cwd, untildify(rawPath));

	for (const abs of expandedPatterns) {
		if (target === abs || target.startsWith(`${abs}/`)) {
			return true;
		}
	}

	const globPatterns = denyPatterns.filter((pattern) => !pattern.startsWith("/") && !pattern.startsWith("~"));
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
	const absolutePatterns = writePatterns.map((pattern) => resolve(cwd, untildify(pattern)));
	for (const abs of absolutePatterns) {
		if (target === abs || target.startsWith(`${abs}/`)) {
			return true;
		}
	}

	const globPatterns = writePatterns.filter((pattern) => !pattern.startsWith("/") && !pattern.startsWith("~"));
	if (globPatterns.length > 0) {
		const ig = ignore().add(globPatterns);
		const rel = relative(cwd, target);
		if (rel && !rel.startsWith("..")) {
			return ig.ignores(rel);
		}
	}

	return false;
}
