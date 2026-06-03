import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CAVEMAN_MANAGED_MANIFEST = 'caveman-managed.json';

export const PACKAGE_ROOT = (() => {
  const thisFile = fileURLToPath(import.meta.url);
  return dirname(dirname(dirname(thisFile)));
})();

export const BUNDLED_AGENTS_DIR = join(PACKAGE_ROOT, 'agents');

type Manifest = Record<string, string>;

export interface SyncResult {
  added: string[];
  updated: string[];
  unchanged: string[];
  removed: string[];
  errors: Array<{ file?: string; op: string; message: string }>;
}

function emptySyncResult(): SyncResult {
  return { added: [], updated: [], unchanged: [], removed: [], errors: [] };
}

function getAgentRoot(): string {
  const configured = process.env.PI_CODING_AGENT_DIR;
  if (configured === '~') return homedir();
  if (configured?.startsWith('~/')) return join(homedir(), configured.slice(2));
  return configured || join(homedir(), '.pi', 'agent');
}

function manifestPath(): string {
  return join(getAgentRoot(), CAVEMAN_MANAGED_MANIFEST);
}

function targetAgentDir(): string {
  return join(getAgentRoot(), 'agents');
}

function isManagedAgentName(name: string): boolean {
  if (typeof name !== 'string' || name.length === 0) return false;
  if (name.includes('\0')) return false;
  if (name.includes('/') || name.includes('\\')) return false;
  if (name === '.' || name === '..') return false;
  if (name.includes('..')) return false;
  if (isAbsolute(name)) return false;
  return /^cavecrew-[a-z0-9-]+\.md$/.test(name);
}

function safeJoin(dir: string, name: string): string | null {
  const resolved = resolve(dir, name);
  const root = resolve(dir) + sep;
  return resolved.startsWith(root) ? resolved : null;
}

function sha256(content: Buffer | string): string {
  return createHash('sha256').update(content).digest('hex');
}

function readManifest(): Manifest {
  try {
    const parsed = JSON.parse(readFileSync(manifestPath(), 'utf8')) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Manifest = {};
    for (const [name, hash] of Object.entries(parsed as Record<string, unknown>)) {
      if (isManagedAgentName(name) && typeof hash === 'string') out[name] = hash;
    }
    return out;
  } catch {
    return {};
  }
}

function writeManifest(result: SyncResult, manifest: Manifest): void {
  try {
    const file = manifestPath();
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  } catch (error) {
    result.errors.push({ op: 'manifest-write', message: error instanceof Error ? error.message : String(error) });
  }
}

function bundledAgents(): Manifest {
  const agents: Manifest = {};
  try {
    for (const entry of readdirSync(BUNDLED_AGENTS_DIR, { withFileTypes: true })) {
      if (!entry.isFile() || !isManagedAgentName(entry.name)) continue;
      agents[entry.name] = sha256(readFileSync(join(BUNDLED_AGENTS_DIR, entry.name)));
    }
  } catch {
    // Missing bundle becomes packaging/test failure; runtime sync degrades silently.
  }
  return agents;
}

function copyAgent(name: string, dest: string, result: SyncResult): boolean {
  try {
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, readFileSync(join(BUNDLED_AGENTS_DIR, name)));
    return true;
  } catch (error) {
    result.errors.push({ file: name, op: 'write-dest', message: error instanceof Error ? error.message : String(error) });
    return false;
  }
}

function removeManagedAgent(name: string, knownHash: string, result: SyncResult): void {
  const dest = safeJoin(targetAgentDir(), name);
  if (dest === null) {
    result.errors.push({ file: name, op: 'remove', message: 'rejected unsafe path' });
    return;
  }
  if (!existsSync(dest)) {
    result.removed.push(name);
    return;
  }
  try {
    const currentHash = sha256(readFileSync(dest));
    if (knownHash !== '' && currentHash === knownHash) {
      unlinkSync(dest);
      result.removed.push(name);
    }
  } catch (error) {
    result.errors.push({ file: name, op: 'remove', message: error instanceof Error ? error.message : String(error) });
  }
}

export function syncBundledCavecrewAgents(): SyncResult {
  const result = emptySyncResult();
  const previous = readManifest();
  const bundled = bundledAgents();
  const next: Manifest = {};
  const targetDir = targetAgentDir();

  for (const [name, sourceHash] of Object.entries(bundled)) {
    const dest = safeJoin(targetDir, name);
    if (dest === null) {
      result.errors.push({ file: name, op: 'write-dest', message: 'rejected unsafe path' });
      continue;
    }

    if (!existsSync(dest)) {
      if (copyAgent(name, dest, result)) {
        result.added.push(name);
        next[name] = sourceHash;
      }
      continue;
    }

    let currentHash: string;
    try {
      currentHash = sha256(readFileSync(dest));
    } catch (error) {
      result.errors.push({ file: name, op: 'read-dest', message: error instanceof Error ? error.message : String(error) });
      continue;
    }

    const knownHash = previous[name];
    if (knownHash !== undefined && knownHash !== '' && currentHash === knownHash && currentHash !== sourceHash) {
      if (copyAgent(name, dest, result)) {
        result.updated.push(name);
        next[name] = sourceHash;
      }
      continue;
    }

    if (currentHash === sourceHash) {
      result.unchanged.push(name);
      next[name] = sourceHash;
    }
    // Unknown or user-edited agents stay user-owned.
  }

  for (const [name, knownHash] of Object.entries(previous)) {
    if (!(name in bundled)) removeManagedAgent(name, knownHash, result);
  }

  writeManifest(result, next);
  return result;
}
