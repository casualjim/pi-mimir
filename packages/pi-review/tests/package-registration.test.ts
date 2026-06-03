import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(path.join(root, file), 'utf8')) as T;
}

describe('pi-review package registration', () => {
  it('declares standalone Pi extension and skills package metadata', async () => {
    const pkg = await readJson<{
      name: string;
      keywords?: string[];
      pi?: { extensions?: string[]; skills?: string[] };
      dependencies?: Record<string, string>;
    }>('package.json');

    expect(pkg.name).toBe('@casualjim/pi-review');
    expect(pkg.keywords).toContain('pi-package');
    expect(pkg.pi?.extensions).toEqual(['extensions/review']);
    expect(pkg.pi?.skills).toEqual(['./skills']);
    expect(pkg.dependencies?.['@casualjim/pi-openspec']).toBeUndefined();
  });

  it('publishes extension, skills, agents, prompt assets, README, and entrypoint', async () => {
    const pkg = await readJson<{ files?: string[] }>('package.json');

    expect(pkg.files).toEqual(expect.arrayContaining(['extensions/', 'skills/', 'agents/', 'prompts/', 'README.md', 'index.js']));
  });

  it('does not define install-time mutation scripts', async () => {
    const pkg = await readJson<{ scripts?: Record<string, string> }>('package.json');

    expect(pkg.scripts?.postinstall).toBeUndefined();
    expect(pkg.scripts?.preinstall).toBeUndefined();
    expect(pkg.scripts?.install).toBeUndefined();
  });
});
