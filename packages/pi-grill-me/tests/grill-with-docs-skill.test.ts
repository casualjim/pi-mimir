import { describe, expect, it } from 'vitest';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const skillRoot = path.join(root, 'skills', 'engineering', 'grill-with-docs');

function parseFrontmatter(markdown: string): Record<string, string> {
  const match = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const result: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const simple = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (!simple) continue;
    const [, key, rawValue] = simple;
    result[key] = rawValue.replace(/^['"]|['"]$/g, '').trim();
  }
  return result;
}

describe('grill-with-docs skill', () => {
  it('bundles grill-with-docs assets', async () => {
    await expect(stat(path.join(skillRoot, 'SKILL.md'))).resolves.toMatchObject({});
    await expect(stat(path.join(skillRoot, 'SPEC-FORMAT.md'))).resolves.toMatchObject({});
    await expect(stat(path.join(skillRoot, 'ADR-FORMAT.md'))).resolves.toMatchObject({});
    await expect(stat(path.join(skillRoot, 'CONTEXT-FORMAT.md'))).rejects.toThrow();
  });

  it('has valid Pi skill frontmatter with attribution', async () => {
    const markdown = await readFile(path.join(skillRoot, 'SKILL.md'), 'utf8');
    const frontmatter = parseFrontmatter(markdown);

    expect(frontmatter.name).toBe('grill-with-docs');
    expect(frontmatter.description).not.toMatch(/Matt Pocock/i);
    expect(frontmatter.description.length).toBeLessThanOrEqual(1024);
  });

  it('instructs Pi to use ask_user_question for grilling questions', async () => {
    const markdown = await readFile(path.join(skillRoot, 'SKILL.md'), 'utf8');

    expect(markdown).toMatch(/ask_user_question/);
    expect(markdown).toMatch(/recommended answer first/i);
  });

  it('declares allowed-tools with codebase-memory, subagent, and ask_user_question', async () => {
    const markdown = await readFile(path.join(skillRoot, 'SKILL.md'), 'utf8');
    const frontmatter = parseFrontmatter(markdown);

    const allowed = frontmatter['allowed-tools'] ?? '';
    expect(allowed).toMatch(/ask_user_question/);
    expect(allowed).toMatch(/subagent/);
    expect(allowed).toMatch(/codebase_memory_search_graph/);
    expect(allowed).toMatch(/codebase_memory_trace_path/);
    expect(allowed).toMatch(/codebase_memory_get_code_snippet/);
    expect(allowed).toMatch(/codebase_memory_get_architecture/);
  });

  it('soft-delegates code fact-finding to cavecrew-investigator with fallback', async () => {
    const markdown = await readFile(path.join(skillRoot, 'SKILL.md'), 'utf8');
    const readme = await readFile(path.join(root, 'README.md'), 'utf8');
    const extension = await readFile(path.join(root, 'index.ts'), 'utf8');

    expect(markdown).toContain('{ "action": "list" }');
    expect(markdown).toContain('cavecrew-investigator');
    expect(markdown).toContain('fall back');
    expect(readme).toContain('Soft-delegates large code fact-finding');
    expect(extension).toContain('cavecrew-investigator');
  });

  it('uses SPEC.md as canonical docs and routes mutations through cavekit-spec', async () => {
    const markdown = await readFile(path.join(skillRoot, 'SKILL.md'), 'utf8');
    const specFormat = await readFile(path.join(skillRoot, 'SPEC-FORMAT.md'), 'utf8');
    const readme = await readFile(path.join(root, 'README.md'), 'utf8');
    const extension = await readFile(path.join(root, 'index.ts'), 'utf8');

    for (const content of [markdown, specFormat, readme, extension]) {
      expect(content).toContain('SPEC.md');
      expect(content).toContain('cavekit-spec');
      expect(content).not.toMatch(/Update CONTEXT\.md inline/i);
      expect(content).not.toMatch(/Create CONTEXT\.md/i);
      expect(content).not.toMatch(/CONTEXT\.md should/i);
      expect(content).not.toMatch(/update project-root `SPEC\.md` right there/i);
      expect(content).not.toMatch(/Always read\/write project-root `SPEC\.md`/i);
    }

    expect(markdown).toContain('read-only legacy input');
    expect(specFormat).toContain('read-only legacy sources');
    expect(extension).toContain('read-only legacy input');
    expect(markdown).toContain('must not directly edit `SPEC.md`');
    expect(specFormat).toContain('only workflow that may mutate it');
    expect(extension).toContain('only workflow that may mutate SPEC.md');
  });
});
