import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    if (['node_modules', '.pi', 'openspec'].includes(entry.name)) return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(full);
    return [full];
  }));
  return files.flat();
}

function trackedPackageFiles(): string[] | undefined {
  try {
    return execFileSync('git', ['-C', root, 'ls-files', '--'], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
  } catch {
    return undefined;
  }
}

describe('pi-heimdall package normalization', () => {
  it('keeps only workspace package resources, not standalone repo artifacts', async () => {
    const forbiddenRoots = ['node_modules', '.pi', 'openspec'];
    const forbiddenFiles = ['fnox.toml', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'];
    const trackedFiles = trackedPackageFiles();

    if (trackedFiles) {
      for (const name of forbiddenRoots) expect(trackedFiles.some((file) => file === name || file.startsWith(`${name}/`)), name).toBe(false);
      for (const name of forbiddenFiles) expect(trackedFiles.includes(name), name).toBe(false);
    } else {
      for (const name of forbiddenRoots) expect(existsSync(path.join(root, name)), name).toBe(false);
      for (const name of forbiddenFiles) expect(existsSync(path.join(root, name)), name).toBe(false);
    }

    const relativeFiles = trackedFiles ?? (await listFiles(root)).map((file) => path.relative(root, file));
    expect(relativeFiles.some((file) => /(^|\/)(research|plan|sandbox-plan)[^/]*\.md$/i.test(file))).toBe(false);
  });

  it('still retains package source, extension, tests, docs, and package metadata', () => {
    for (const name of ['package.json', 'README.md', 'LICENSE', 'tsconfig.json', 'vitest.config.ts']) {
      expect(existsSync(path.join(root, name)), name).toBe(true);
    }
    expect(existsSync(path.join(root, 'extensions', 'heimdall.ts'))).toBe(true);
    expect(existsSync(path.join(root, 'lib'))).toBe(true);
    expect(existsSync(path.join(root, 'tests'))).toBe(true);
  });
});
