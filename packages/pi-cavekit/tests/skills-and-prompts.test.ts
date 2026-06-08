import { describe, expect, it } from 'vitest';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skillsRoot = path.join(root, 'skills');
const promptsRoot = path.join(root, 'prompts');

const requiredSkills = ['cavekit-spec', 'cavekit-build', 'cavekit-check', 'cavekit-archive', 'cavekit-backprop'];
const requiredPrompts = ['ck:spec.md', 'ck:build.md', 'ck:check.md', 'ck:archive.md'];

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

describe('Cavekit skill files', () => {
  it('includes the Pi Cavekit skill surface', async () => {
    for (const skill of requiredSkills) {
      const skillPath = path.join(skillsRoot, skill, 'SKILL.md');
      expect((await stat(skillPath)).isFile(), `${skill} exists`).toBe(true);
    }
  });

  it('uses valid unique cavekit-* frontmatter names with descriptions', async () => {
    const names = new Set<string>();

    for (const dir of await readdir(skillsRoot)) {
      const skillPath = path.join(skillsRoot, dir, 'SKILL.md');
      const markdown = await readFile(skillPath, 'utf8');
      const frontmatter = parseFrontmatter(markdown);

      expect(frontmatter.name, `${dir} has name`).toMatch(/^cavekit-[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(frontmatter.name.length, `${dir} name length`).toBeLessThanOrEqual(64);
      expect(frontmatter.description, `${dir} has description`).toBeTruthy();
      expect(frontmatter.description.length, `${dir} description length`).toBeLessThanOrEqual(1024);
      expect(names.has(frontmatter.name), `${frontmatter.name} unique`).toBe(false);
      names.add(frontmatter.name);
      expect(markdown, `${dir} references bundled FORMAT.md`).toContain('../../FORMAT.md');
    }

    expect([...names].sort()).toEqual([...requiredSkills].sort());
  });

  it('soft-uses cavecrew-investigator without requiring pi-caveman', async () => {
    const spec = await readFile(path.join(skillsRoot, 'cavekit-spec', 'SKILL.md'), 'utf8');
    const check = await readFile(path.join(skillsRoot, 'cavekit-check', 'SKILL.md'), 'utf8');
    const backprop = await readFile(path.join(skillsRoot, 'cavekit-backprop', 'SKILL.md'), 'utf8');

    expect(spec).toContain('If `cavecrew-investigator` is available');
    expect(spec).toContain('DISTILL');
    expect(check).toContain('Optional Cavecrew investigation');
    expect(check).toContain('§I implementations, §V enforcement/tests, §T status evidence');
    expect(backprop).toContain('read-only compressed trace evidence');
    expect(backprop).toContain('do not mutate `SPEC.md`');

    for (const markdown of [spec, check, backprop]) {
      expect(markdown).toContain('must not design, fix, edit');
      expect(markdown).toContain('If unavailable');
    }
  });

  it('uses ask_user_question for Cavekit decisions instead of prose-only choice lists', async () => {
    const spec = await readFile(path.join(skillsRoot, 'cavekit-spec', 'SKILL.md'), 'utf8');
    const build = await readFile(path.join(skillsRoot, 'cavekit-build', 'SKILL.md'), 'utf8');
    const archive = await readFile(path.join(skillsRoot, 'cavekit-archive', 'SKILL.md'), 'utf8');
    const backprop = await readFile(path.join(skillsRoot, 'cavekit-backprop', 'SKILL.md'), 'utf8');

    expect(spec).toContain('## Question protocol');
    expect(spec).toContain('Use `ask_user_question` whenever Cavekit needs a decision from the user');
    expect(spec).toContain('missing AMEND target or replacement text');
    expect(spec).toContain('Do not print prose-only choice lists and wait');
    expect(spec).toContain('Present needed context before calling `ask_user_question`');
    expect(spec).toContain('Options are decision controls, not context transport');
    expect(spec).toContain('long replacement text belongs in pre-question context');

    expect(build).toContain('Use `ask_user_question` for plan approval');
    expect(build).toContain('Classify cause with the user when needed via `ask_user_question`');
    expect(archive).toContain('Ask approval with `ask_user_question` after preview');
    expect(archive).toContain('Do not use a prose-only `Proceed?` prompt');
    expect(backprop).toContain('use `ask_user_question` when classification is unclear');
    expect(backprop).toContain('Use `ask_user_question` for approval');
  });
});

describe('Cavekit prompt templates', () => {
  it('preserves /ck:* command names through colon filenames', async () => {
    const files = await readdir(promptsRoot);
    expect(files.sort()).toEqual([...requiredPrompts].sort());
  });

  it('includes autocomplete metadata and routes to Cavekit skills', async () => {
    for (const prompt of requiredPrompts) {
      const markdown = await readFile(path.join(promptsRoot, prompt), 'utf8');
      const frontmatter = parseFrontmatter(markdown);
      const expectedSkill = prompt.replace(/^ck:/, 'cavekit-').replace(/\.md$/, '');

      expect(frontmatter.description, `${prompt} description`).toBeTruthy();
      expect(frontmatter['argument-hint'], `${prompt} argument hint`).toBeTruthy();
      expect(markdown, `${prompt} routes to ${expectedSkill}`).toContain(expectedSkill);
    }
  });

  it('tells /ck:spec to explain plan context outside question options', async () => {
    const markdown = await readFile(path.join(promptsRoot, 'ck:spec.md'), 'utf8');

    expect(markdown).toContain('explain context/plan/diff/tradeoffs before calling `ask_user_question`');
    expect(markdown).toContain('do not hide the plan in option descriptions');
  });
});
