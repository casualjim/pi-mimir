import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";
import { homedir } from "node:os";

const BIN_NAME = "crumbs";

const PATHEXT: readonly string[] =
	process.platform === "win32" ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";").filter(Boolean) : [""];

type CacheState = { resolved: string | undefined; scanned: boolean };

let cache: CacheState = { resolved: undefined, scanned: false };

export function resetCrumbsBinCache(): void {
	cache = { resolved: undefined, scanned: false };
}

function isExecutable(path: string): boolean {
	try {
		accessSync(path, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

function scanPath(): string | undefined {
	const pathEnv = process.env.PATH ?? "";
	if (!pathEnv) return undefined;
	for (const dir of pathEnv.split(delimiter)) {
		if (!dir) continue;
		for (const ext of PATHEXT) {
			const candidate = join(dir, `${BIN_NAME}${ext}`);
			if (isExecutable(candidate)) return candidate;
		}
	}
	return undefined;
}

function cargoBin(): string | undefined {
	const candidate = join(homedir(), ".cargo", "bin", BIN_NAME);
	return isExecutable(candidate) ? candidate : undefined;
}

export function resolveCrumbsBin(): string | undefined {
	const override = process.env.PI_CRUMBS_BIN;
	if (override && override.trim()) return override.trim();
	return scanPath() ?? cargoBin();
}

export function getCrumbsBin(): string | undefined {
	if (!cache.scanned) {
		cache = { resolved: resolveCrumbsBin(), scanned: true };
	}
	return cache.resolved;
}

export function hasCrumbs(): boolean {
	return getCrumbsBin() !== undefined;
}
