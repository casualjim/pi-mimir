import { describe, expect, it } from 'vitest';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const skillsRoot = path.join(root, 'skills');

const requiredSkills = [
  'caveman',
  'caveman-commit',
  'caveman-review',
  'caveman-help',
  'caveman-compress',
  'caveman-stats',
  'cavecrew',
];

function parseFrontmatter(markdown: string): Record<string, string> {
  const match = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const result: Record<string, string> = {};
  const lines = match[1].split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const simple = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (!simple) continue;

    const [, key, rawValue] = simple;
    if (rawValue === '>' || rawValue === '|') {
      const block: string[] = [];
      for (let j = i + 1; j < lines.length; j += 1) {
        if (/^[a-zA-Z0-9_-]+:\s*/.test(lines[j])) break;
        block.push(lines[j].trim());
        i = j;
      }
      result[key] = block.join(' ').trim();
    } else {
      result[key] = rawValue.replace(/^['"]|['"]$/g, '').trim();
    }
  }
  return result;
}

describe('Caveman skill files', () => {
  it('includes the full Pi Caveman skill surface', async () => {
    for (const skill of requiredSkills) {
      const skillPath = path.join(skillsRoot, skill, 'SKILL.md');
      expect((await stat(skillPath)).isFile()).toBe(true);
    }
  });

  it('uses valid unique frontmatter names with descriptions', async () => {
    const names = new Set<string>();

    for (const dir of await readdir(skillsRoot)) {
      const skillPath = path.join(skillsRoot, dir, 'SKILL.md');
      const markdown = await readFile(skillPath, 'utf8');
      const frontmatter = parseFrontmatter(markdown);

      expect(frontmatter.name, `${dir} has name`).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(frontmatter.name.length, `${dir} name length`).toBeLessThanOrEqual(64);
      expect(frontmatter.description, `${dir} has description`).toBeTruthy();
      expect(frontmatter.description.length, `${dir} description length`).toBeLessThanOrEqual(1024);
      expect(names.has(frontmatter.name), `${frontmatter.name} unique`).toBe(false);
      names.add(frontmatter.name);
    }

    expect([...names].sort()).toEqual([...requiredSkills].sort());
  });

  it('keeps caveman-stats wording aligned with Pi-native hooks', async () => {
    const skill = await readFile(path.join(skillsRoot, 'caveman-stats', 'SKILL.md'), 'utf8');
    const readme = await readFile(path.join(skillsRoot, 'caveman-stats', 'README.md'), 'utf8');
    const combined = `${skill}\n${readme}`;

    expect(combined).not.toMatch(/skills-only package/i);
    expect(combined).toMatch(/Pi-native mode hooks/);
    expect(combined).toMatch(/No fake estimate/i);
  });
});
