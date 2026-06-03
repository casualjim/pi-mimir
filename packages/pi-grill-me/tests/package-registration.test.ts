import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(path.join(root, file), 'utf8')) as T;
}

describe('pi-grill-me package registration', () => {
  it('declares Pi package metadata, skill, and extension without question UI dependency', async () => {
    const pkg = await readJson<{
      name: string;
      description: string;
      keywords?: string[];
      pi?: { skills?: string[]; extensions?: string[] };
      dependencies?: Record<string, string>;
    }>('package.json');

    expect(pkg.name).toBe('@casualjim/pi-grill-me');
    expect(pkg.description).toMatch(/Matt Pocock/i);
    expect(pkg.description).toMatch(/grill-with-docs/i);
    expect(pkg.keywords).toContain('pi-package');
    expect(pkg.pi?.skills).toEqual(['./skills']);
    expect(pkg.pi?.extensions).toEqual(['./index.ts']);
    expect(pkg.dependencies?.['@juicesharp/rpiv-ask-user-question']).toBeUndefined();
  });

  it('does not define install-time mutation scripts', async () => {
    const pkg = await readJson<{ scripts?: Record<string, string> }>('package.json');

    expect(pkg.scripts?.postinstall).toBeUndefined();
    expect(pkg.scripts?.preinstall).toBeUndefined();
    expect(pkg.scripts?.install).toBeUndefined();
  });
});
