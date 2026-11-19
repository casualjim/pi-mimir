import { describe, expect, it } from 'vitest';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skillsRoot = path.join(root, 'skills');
const promptsRoot = path.join(root, 'prompts');

const requiredSkills = ['cavekit-spec', 'cavekit-build', 'cavekit-check', 'cavekit-archive', 'cavekit-backprop', 'cavekit-grill', 'cavekit-research', 'cavekit-review', 'cavekit-deepen'];
const requiredPrompts = ['ck:spec.md', 'ck:build.md', 'ck:check.md', 'ck:archive.md', 'ck:grill.md', 'ck:research.md', 'ck:review.md', 'ck:deepen.md'];

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

  it('routes decisions through the shared host policy', async () => {
    const format = await readFile(path.join(root, 'FORMAT.md'), 'utf8');
    expect(format).toMatch(/omp[\s\S]*?`ask`[\s\S]*?Pi[\s\S]*?`ask_user`[\s\S]*?`ask_user_question`/);
    expect(format).toMatch(/native confirm only when the caller actually exposes it/);
    expect(format).toMatch(/ask directly and wait for an explicit response/);
    expect(format).toMatch(/Do not present prose-only choices while an ask tool is available/);
    expect(format).toMatch(/before the question[\s\S]*?decision controls concise/);

    for (const skill of ['spec', 'build', 'archive', 'backprop', 'grill', 'review']) {
      const markdown = await readFile(path.join(skillsRoot, `cavekit-${skill}`, 'SKILL.md'), 'utf8');
      expect(markdown, skill).toContain('../../FORMAT.md#user-decisions');
    }
    for (const prompt of ['build', 'grill', 'review', 'spec']) {
      const markdown = await readFile(path.join(promptsRoot, `ck:${prompt}.md`), 'utf8');
      expect(markdown, prompt).toContain('../FORMAT.md#user-decisions');
    }
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

  it('tells /ck:build to share the plan before asking a concise decision question', async () => {
    const markdown = await readFile(path.join(promptsRoot, 'ck:build.md'), 'utf8');

    expect(markdown).toContain('Before asking for approval, share the full plan in normal assistant text');
    expect(markdown).toContain('selected tasks, cited §V/§I, files to edit/create, tests, verification commands');
    expect(markdown).toContain('../FORMAT.md#user-decisions');
    expect(markdown).toContain('Do not put the plan in the question field, option descriptions, or previews');
  });

  it('keeps /ck:spec question guidance focused on spec context and diffs', async () => {
    const markdown = await readFile(path.join(promptsRoot, 'ck:spec.md'), 'utf8');

    expect(markdown).toContain('first share relevant context, proposed SPEC.md text or diff, tradeoffs, and recommendation');
    expect(markdown).toContain('../FORMAT.md#user-decisions');
    expect(markdown).toContain('Do not put context or diff details in the question field, option descriptions, or previews');
  });
});
