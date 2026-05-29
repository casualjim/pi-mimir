import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(path.join(root, file), 'utf8')) as T;
}

describe('pi-cavekit package registration', () => {
  it('declares Pi package metadata, skills, and prompts without an extension', async () => {
    const pkg = await readJson<{
      name: string;
      keywords?: string[];
      pi?: { skills?: string[]; prompts?: string[]; extensions?: string[] };
    }>('package.json');

    expect(pkg.name).toBe('@casualjim/pi-cavekit');
    expect(pkg.keywords).toContain('pi-package');
    expect(pkg.pi?.skills).toEqual(['skills']);
    expect(pkg.pi?.prompts).toEqual(['prompts']);
    expect(pkg.pi?.extensions).toBeUndefined();
  });

  it('publishes skills, prompts, FORMAT.md, README, license, and entrypoint', async () => {
    const pkg = await readJson<{ files?: string[] }>('package.json');

    expect(pkg.files).toEqual(
      expect.arrayContaining(['skills/', 'prompts/', 'FORMAT.md', 'README.md', 'LICENSE', 'index.js']),
    );
  });

  it('does not define install-time mutation scripts or pi-caveman dependency', async () => {
    const pkg = await readJson<{
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    }>('package.json');

    expect(pkg.scripts?.postinstall).toBeUndefined();
    expect(pkg.scripts?.preinstall).toBeUndefined();
    expect(pkg.scripts?.install).toBeUndefined();
    expect(pkg.dependencies ?? {}).not.toHaveProperty('@casualjim/pi-caveman');
    expect(pkg.peerDependencies ?? {}).not.toHaveProperty('@casualjim/pi-caveman');
  });
});
