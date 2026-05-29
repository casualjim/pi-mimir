import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(path.join(root, file), 'utf8')) as T;
}

describe('pi-caveman package registration', () => {
  it('declares Pi package metadata and skills path', async () => {
    const pkg = await readJson<{
      name: string;
      keywords?: string[];
      files?: string[];
      pi?: { skills?: string[] };
    }>('package.json');

    expect(pkg.name).toBe('@casualjim/pi-caveman');
    expect(pkg.keywords).toContain('pi-package');
    expect(pkg.pi?.skills).toEqual(['skills']);
  });

  it('publishes skills, agents, README, license, and entrypoint', async () => {
    const pkg = await readJson<{ files?: string[] }>('package.json');

    expect(pkg.files).toEqual(
      expect.arrayContaining(['skills/', 'agents/', 'README.md', 'LICENSE', 'index.js']),
    );
  });

  it('does not define install-time mutation scripts', async () => {
    const pkg = await readJson<{ scripts?: Record<string, string> }>('package.json');

    expect(pkg.scripts?.postinstall).toBeUndefined();
    expect(pkg.scripts?.preinstall).toBeUndefined();
    expect(pkg.scripts?.install).toBeUndefined();
  });
});
