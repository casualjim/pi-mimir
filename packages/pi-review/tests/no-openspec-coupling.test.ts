import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');

async function collectFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(full));
    else files.push(full);
  }
  return files;
}

describe('standalone package boundary', () => {
  it('does not reference pi-openspec or OpenSpec workflow internals', async () => {
    const files = [
      path.join(root, 'package.json'),
      ...await collectFiles(path.join(root, 'extensions')),
      ...await collectFiles(path.join(root, 'prompts')),
    ];
    const haystack = (await Promise.all(files.map((file) => readFile(file, 'utf8')))).join('\n');

    expect(haystack).not.toContain('@casualjim/pi-openspec');
    expect(haystack).not.toContain('openspec/changes');
    expect(haystack).not.toContain('review-gated');
  });
});
