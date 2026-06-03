import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(full);
    return [full];
  }));
  return files.flat();
}

describe('pi-heimdall package normalization', () => {
  it('keeps only workspace package resources, not standalone repo artifacts', async () => {
    const forbiddenRoots = ['node_modules', '.pi', 'openspec'];
    for (const name of forbiddenRoots) expect(existsSync(path.join(root, name)), name).toBe(false);

    const forbiddenFiles = ['fnox.toml', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'];
    for (const name of forbiddenFiles) expect(existsSync(path.join(root, name)), name).toBe(false);

    const relativeFiles = (await listFiles(root)).map((file) => path.relative(root, file));
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
