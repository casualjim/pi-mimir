import { describe, expect, it } from 'vitest';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(full);
    return [full];
  }));
  return files.flat();
}

describe('Cavekit reference resources', () => {
  it('includes FORMAT.md with SPEC.md section definitions', async () => {
    const format = await readFile(path.join(root, 'FORMAT.md'), 'utf8');

    expect(format).toContain('# SPEC');
    expect(format).toContain('## §G GOAL');
    expect(format).toContain('## §C CONSTRAINTS');
    expect(format).toContain('## §I INTERFACES');
    expect(format).toContain('## §V INVARIANTS');
    expect(format).toContain('## §T TASKS');
    expect(format).toContain('## §B BUGS');
  });

  it('includes README, license, and package entrypoint files', async () => {
    expect((await stat(path.join(root, 'README.md'))).isFile()).toBe(true);
    expect((await stat(path.join(root, 'LICENSE'))).isFile()).toBe(true);
    expect((await stat(path.join(root, 'index.js'))).isFile()).toBe(true);

    const readme = await readFile(path.join(root, 'README.md'), 'utf8');
    expect(readme).toContain('https://github.com/JuliusBrussee/cavekit');
    expect(readme).toContain('Pi port');
    expect(readme).toContain('pi-caveman');
    expect(readme).toContain('complementary');
  });
});

describe('non-Pi and superseded resource exclusion', () => {
  it('does not include the upstream embedded caveman skill', async () => {
    const skillDirs = await readdir(path.join(root, 'skills'));
    expect(skillDirs).not.toContain('caveman');
  });

  it('does not package active upstream installer, hook, plugin, extension, or managed config files', async () => {
    const relativeFiles = (await listFiles(root)).map((file) => path.relative(root, file));

    expect(relativeFiles).not.toContain('install.sh');
    expect(relativeFiles).not.toContain('install.ps1');
    expect(relativeFiles).not.toContain('bin/install.js');
    expect(relativeFiles).not.toContain('plugin.json');
    expect(relativeFiles).not.toContain('.claude-plugin/plugin.json');
    expect(relativeFiles).not.toContain('.claude-plugin/marketplace.json');
    expect(relativeFiles.some((file) => file.startsWith('extensions/'))).toBe(false);
    expect(relativeFiles.some((file) => file.includes('managed'))).toBe(false);
    expect(relativeFiles.some((file) => file.includes('hook'))).toBe(false);
  });
});
