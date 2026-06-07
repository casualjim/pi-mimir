import { describe, expect, it } from 'vitest';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function text(file: string): Promise<string> {
  return readFile(path.join(root, file), 'utf8');
}

describe('Cavekit archive surface', () => {
  it('ships cavekit-archive skill and /ck:archive prompt', async () => {
    expect((await stat(path.join(root, 'skills/cavekit-archive/SKILL.md'))).isFile()).toBe(true);
    expect((await stat(path.join(root, 'prompts/ck:archive.md'))).isFile()).toBe(true);

    const skill = await text('skills/cavekit-archive/SKILL.md');
    const prompt = await text('prompts/ck:archive.md');
    const readme = await text('README.md');

    expect(skill).toContain('name: cavekit-archive');
    expect(skill).toContain('../../FORMAT.md');
    expect(prompt).toContain('Use the `cavekit-archive` skill workflow');
    expect(readme).toContain('/ck:archive');
    expect(readme).toContain('cavekit-archive');
  });
});

describe('Cavekit archive safety workflow', () => {
  it('documents no-write precheck for missing or small SPEC.md', async () => {
    const skill = await text('skills/cavekit-archive/SKILL.md');

    expect(skill).toContain('If missing');
    expect(skill).toContain('stop with no writes');
    expect(skill).toContain('≤500');
    expect(skill).toContain('Missing `SPEC.md` or `≤500` lines → no write');
  });

  it('requires dry-run preview and explicit approval before writes', async () => {
    const skill = await text('skills/cavekit-archive/SKILL.md');
    const prompt = await text('prompts/ck:archive.md');

    expect(skill).toContain('DRY-RUN PREVIEW — no writes');
    expect(skill).toContain('Do not create directories, archive files, or edit `SPEC.md` during preview');
    expect(skill).toContain('Ask approval with `ask_user_question` after preview');
    expect(skill).toContain('Do not use a prose-only `Proceed?` prompt');
    expect(skill).toContain('No writes before dry-run preview and explicit user OK');
    expect(prompt).toContain('write only after explicit user approval');
  });

  it('copies full SPEC.md before trimming working SPEC.md', async () => {
    const skill = await text('skills/cavekit-archive/SKILL.md');
    const format = await text('FORMAT.md');
    const readme = await text('README.md');

    expect(skill).toContain('Copy exact full pre-trim `SPEC.md`');
    expect(skill).toContain('Only after archive copy succeeds, edit working `SPEC.md`');
    expect(skill).toContain('Archive = exact full pre-trim copy. Content loss ⊥.');
    expect(format).toContain('Copy exact full SPEC.md');
    expect(readme).toContain('copies exact full pre-trim `SPEC.md`');
  });

  it('documents trim rules and archive comments', async () => {
    const skill = await text('skills/cavekit-archive/SKILL.md');
    const format = await text('FORMAT.md');

    for (const markdown of [skill, format]) {
      expect(markdown).toContain('§T');
      expect(markdown).toContain('status `x`');
      expect(markdown).toContain('§B');
      expect(markdown).toContain('older than 90 days');
      expect(markdown).toContain('active §T');
      expect(markdown).toContain('status `.` or `~`');
      expect(markdown).toContain('§G');
      expect(markdown).toContain('archive: .cavekit/archive/SPEC-<date>.md §T T1-T12');
      expect(markdown).toContain('archive: .cavekit/archive/SPEC-<date>.md §B B1-B5');
      expect(markdown).toContain('archive: .cavekit/archive/SPEC-<date>.md §V V1,V3-V5');
      expect(markdown).toContain('archive: .cavekit/archive/SPEC-<date>.md §I I.api,I.cli');
      expect(markdown).toContain('archive: .cavekit/archive/SPEC-<date>.md §C');
    }
  });
});

describe('Cavekit archive-aware ID and cite lookup', () => {
  it('keeps IDs monotonic across current tables, archive comments, and archived copies', async () => {
    const format = await text('FORMAT.md');
    const spec = await text('skills/cavekit-spec/SKILL.md');
    const archive = await text('skills/cavekit-archive/SKILL.md');

    expect(format).toContain('max(current IDs + archive comment ranges + archived SPEC.md copies)');
    expect(spec).toContain('max(current IDs + archive comment ranges + archived SPEC.md IDs) + 1');
    expect(spec).toContain('Never restart at `T1`, `V1`, or `B1` when archived IDs exist');
    expect(archive).toContain('Never reuse IDs');
  });

  it('teaches spec/build/check to resolve archived comments and archived SPEC.md copies', async () => {
    const spec = await text('skills/cavekit-spec/SKILL.md');
    const build = await text('skills/cavekit-build/SKILL.md');
    const check = await text('skills/cavekit-check/SKILL.md');

    for (const markdown of [spec, build, check]) {
      expect(markdown).toContain('archive comments');
      expect(markdown).toContain('.cavekit/archive/SPEC-*.md');
    }

    expect(build).toContain('resolve full archived text');
    expect(check).toContain('include archived §T rows referenced by archive comments');
  });
});
