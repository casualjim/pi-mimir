import { describe, expect, it } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
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

describe('non-Pi installer exclusion', () => {
  it('does not package active upstream installer entrypoints', async () => {
    const relativeFiles = (await listFiles(root)).map((file) => path.relative(root, file));

    expect(relativeFiles).not.toContain('install.sh');
    expect(relativeFiles).not.toContain('install.ps1');
    expect(relativeFiles).not.toContain('bin/install.js');
    expect(relativeFiles).not.toContain('src/hooks/install.sh');
    expect(relativeFiles).not.toContain('src/hooks/install.ps1');
  });

  it('keeps hook references informational, not active package behavior', async () => {
    const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')) as {
      pi?: { extensions?: string[] };
    };

    expect(pkg.pi?.extensions).toBeUndefined();
  });
});
