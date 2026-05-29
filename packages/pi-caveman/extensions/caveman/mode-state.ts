import { constants, existsSync, lstatSync, mkdirSync, openSync, readSync, realpathSync, renameSync, rmSync, statSync, writeSync, closeSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";

export const VALID_MODES = [
  "off",
  "lite",
  "full",
  "ultra",
  "wenyan-lite",
  "wenyan",
  "wenyan-full",
  "wenyan-ultra",
  "commit",
  "review",
  "compress",
] as const;

export type CavemanMode = typeof VALID_MODES[number];

export const INDEPENDENT_MODES = new Set<CavemanMode>(["commit", "review", "compress"]);
export const MAX_MODE_BYTES = 64;

function isValidMode(value: string): value is CavemanMode {
  return (VALID_MODES as readonly string[]).includes(value);
}

export function normalizeMode(value: unknown): CavemanMode | null {
  if (typeof value !== "string") return null;
  const raw = value.trim().toLowerCase();
  if (raw === "wenyan-full") return "wenyan";
  return isValidMode(raw) ? raw : null;
}

export function getConfigDir(): string {
  if (process.env.PI_CAVEMAN_CONFIG_DIR) return process.env.PI_CAVEMAN_CONFIG_DIR;
  if (process.env.XDG_CONFIG_HOME) return join(process.env.XDG_CONFIG_HOME, "pi-caveman");
  if (process.platform === "win32") return join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "pi-caveman");
  return join(homedir(), ".config", "pi-caveman");
}

export function getModeStatePath(): string {
  return join(getConfigDir(), "mode");
}

export function getConfigPath(): string {
  return join(getConfigDir(), "config.json");
}

export function getDefaultMode(): CavemanMode {
  const envMode = normalizeMode(process.env.CAVEMAN_DEFAULT_MODE);
  if (envMode) return envMode;

  try {
    const parsed = JSON.parse(readFileSync(getConfigPath(), "utf8")) as { defaultMode?: unknown };
    const fileMode = normalizeMode(parsed.defaultMode);
    if (fileMode) return fileMode;
  } catch {
    // ignore missing or invalid config
  }

  return "full";
}

function safeRealParent(filePath: string): string | null {
  const dir = dirname(filePath);
  try {
    mkdirSync(dir, { recursive: true });
    const dirStat = lstatSync(dir);
    if (!dirStat.isSymbolicLink()) return dir;

    const realDir = realpathSync(dir);
    const realStat = statSync(realDir);
    if (!realStat.isDirectory()) return null;

    if (typeof process.getuid === "function") {
      if (realStat.uid !== process.getuid()) return null;
    } else {
      const home = resolve(homedir()).toLowerCase();
      const real = resolve(realDir).toLowerCase();
      if (real !== home && !real.startsWith(`${home}${sep}`)) return null;
    }

    return realDir;
  } catch {
    return null;
  }
}

export function safeWriteMode(mode: CavemanMode): void {
  if (mode === "off") {
    clearModeState();
    return;
  }

  const statePath = getModeStatePath();
  const realDir = safeRealParent(statePath);
  if (!realDir) return;

  const realPath = join(realDir, "mode");
  try {
    try {
      if (lstatSync(realPath).isSymbolicLink()) return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") return;
    }

    const tmp = join(realDir, `.mode.${process.pid}.${Date.now()}`);
    const nofollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
    const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | nofollow;
    let fd: number | undefined;
    try {
      fd = openSync(tmp, flags, 0o600);
      writeSync(fd, mode);
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
    renameSync(tmp, realPath);
  } catch {
    // mode state best-effort
  }
}

export function readModeState(): CavemanMode | null {
  const statePath = getModeStatePath();
  try {
    const st = lstatSync(statePath);
    if (st.isSymbolicLink() || !st.isFile() || st.size > MAX_MODE_BYTES) return null;

    const nofollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
    let fd: number | undefined;
    try {
      fd = openSync(statePath, constants.O_RDONLY | nofollow);
      const buf = Buffer.alloc(MAX_MODE_BYTES);
      const n = readSync(fd, buf, 0, MAX_MODE_BYTES, 0);
      return normalizeMode(buf.slice(0, n).toString("utf8"));
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
  } catch {
    return null;
  }
}

export function clearModeState(): void {
  const statePath = getModeStatePath();
  try {
    if (existsSync(statePath) && !lstatSync(statePath).isSymbolicLink()) rmSync(statePath, { force: true });
  } catch {
    // best-effort
  }
}
