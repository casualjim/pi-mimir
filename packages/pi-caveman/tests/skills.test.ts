import { describe, expect, it } from 'vitest';
import { mkdtemp, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const skillsRoot = path.join(root, 'skills');
const compressRoot = path.join(skillsRoot, 'caveman-compress');

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

  it('keeps caveman-compress Pi-native instead of provider-specific helper calls', async () => {
    const skill = await readFile(path.join(compressRoot, 'SKILL.md'), 'utf8');
    const readme = await readFile(path.join(compressRoot, 'README.md'), 'utf8');
    const security = await readFile(path.join(compressRoot, 'SECURITY.md'), 'utf8');
    const compress = await readFile(path.join(compressRoot, 'scripts', 'compress.py'), 'utf8');
    const combined = `${skill}\n${readme}\n${security}\n${compress}`;

    expect(compress).toContain('"pi"');
    expect(compress).toContain('"--print"');
    const banned = [
      new RegExp(['ANTHROPIC', 'API', 'KEY'].join('_')),
      new RegExp(['import ', 'anthropic'].join('')),
      new RegExp(['Anthropic', '\\s+(SDK|API)'].join(''), 'i'),
      new RegExp(['claude', '\\s+--print'].join(''), 'i'),
      new RegExp(['call', 'claude'].join('_')),
      new RegExp(['Compressing with ', 'Claude'].join('')),
    ];
    for (const pattern of banned) expect(combined).not.toMatch(pattern);
  });

  it('validates caveman-compress protected regions and backup safety hooks', async () => {
    const original = `# Title\n\nProse before.\n\nSee https://example.com and \`inline_code\` in /tmp/file.txt.\n\n\`\`\`ts\nconst x = 1;\n\`\`\`\n`;
    const compressed = `# Title\n\nProse.\n\nSee https://example.com and \`inline_code\` in /tmp/file.txt.\n\n\`\`\`ts\nconst x = 1;\n\`\`\`\n`;
    const bad = `# Title\n\nProse.\n\nSee https://example.com and \`changed_code\` in /tmp/file.txt.\n\n\`\`\`ts\nconst x = 2;\n\`\`\`\n`;
    const dir = await mkdtemp(path.join(tmpdir(), 'caveman-compress-'));
    const originalPath = path.join(dir, 'note.original.md');
    const compressedPath = path.join(dir, 'note.md');
    const badPath = path.join(dir, 'bad.md');
    await writeFile(originalPath, original, 'utf8');
    await writeFile(compressedPath, compressed, 'utf8');
    await writeFile(badPath, bad, 'utf8');

    const pythonEnv = { ...process.env, PYTHONDONTWRITEBYTECODE: '1' };
    const ok = spawnSync('python3', ['-m', 'scripts.validate', originalPath, compressedPath], { cwd: compressRoot, encoding: 'utf8', env: pythonEnv });
    expect(ok.status).toBe(0);
    expect(ok.stdout).toContain('Valid: True');

    const failed = spawnSync('python3', ['-m', 'scripts.validate', originalPath, badPath], { cwd: compressRoot, encoding: 'utf8', env: pythonEnv });
    expect(failed.status).toBe(0);
    expect(failed.stdout).toContain('Valid: False');
    expect(failed.stdout).toContain('Code blocks not preserved exactly');
    expect(failed.stdout).toContain('Inline code lost');

    const compressSource = await readFile(path.join(compressRoot, 'scripts', 'compress.py'), 'utf8');
    expect(compressSource).toContain('backup_path.exists()');
    expect(compressSource).toContain('backup_readback != original_text');
    expect(compressSource).toContain('filepath.write_text(original_text)');
  });
});
