import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function readSkill(name: string): string {
  return readFileSync(join('skills', name, 'SKILL.md'), 'utf8');
}

function descriptionOf(text: string): string {
  return text.match(/^description: (.+)$/m)?.[1] ?? '';
}

describe('review skill package', () => {
  it('ships implementation and specialist review skills', () => {
    expect(readdirSync('skills').sort()).toEqual([
      'review-architecture',
      'review-data-flow',
      'review-implementation',
      'review-security',
      'review-tests',
    ]);
  });

  it('every bundled review skill has name and explicit-review description', () => {
    for (const name of readdirSync('skills')) {
      const text = readSkill(name);
      expect(text.startsWith('---\n'), `${name} missing frontmatter`).toBe(true);
      expect(text).toContain(`name: ${name}`);
      expect(descriptionOf(text)).toMatch(/Use when/);
      expect(descriptionOf(text).toLowerCase()).not.toContain('all code review');
    }
  });

  it('review-implementation is whole-tree and uses caveman review output', () => {
    const text = readSkill('review-implementation');

    expect(text).toContain('disable-model-invocation: true');
    expect(text).toContain('whole-tree implementation review');
    expect(text).toContain('This is a whole-tree implementation review, not an active-changeset review');
    expect(text).toContain('Diff or changed files are discovery seeds only, never review boundaries');
    expect(text).toContain('Do not restrict findings to changed files or changed lines');
    expect(text).toContain('Do not apply active-changeset or diff-overlap limits');
    expect(text).toContain('grouping findings with the same root cause');
    expect(text).toContain('caveman/cavecrew-reviewer-style terse format');
    expect(text).toContain('path/to/file.ts:42: 🔴 blocker');
    expect(text).toContain('totals: 1🔴 1🟡 0🔵 1❓ 1✅');
    expect(text).toContain('implementation-reviewer');
    expect(text).toContain('Never set a subagent timeout');
    expect(text).toContain('express it in hours (`1 hour`, `2 hours`), never seconds or minutes');
    expect(text).toContain('do not invent new requirements or generic best-practice improvements');
    expect(text).toContain('judge correctness, repo rules, and SPEC.md/artifact adherence only');
    expect(text).toContain('/skill:review-architecture <review-scope>');
    expect(text).toContain('/skill:review-tests <review-scope>');
    expect(text).toContain('/skill:review-data-flow <review-scope>');
    expect(text).toContain('/skill:review-security <review-scope>');
    expect(text).toContain('does not include commit, push, PR, archive, or finishing-branch behavior');
    expect(text).not.toContain('### Summary');
    expect(text).not.toContain('### Issues by Priority');
  });

  it('specialists require evidence-based findings in caveman format', () => {
    for (const name of ['review-architecture', 'review-tests', 'review-data-flow', 'review-security']) {
      const text = readSkill(name);
      expect(text).toContain('explicit `<review-scope>`');
      expect(text).toContain('OpenSpec artifacts as optional context when supplied');
      expect(text).toContain('Do not require `openspec/changes/...` for non-OpenSpec scopes');
      expect(text).toContain('Use caveman review format');
      expect(text).toContain('path/to/file.ts:42: 🔴 blocker');
      expect(text).toContain('totals: 1🔴 1🟡 0🔵 1❓ 1✅');
      expect(text).toContain('single-shot');
      expect(text).not.toContain('### Issues by Priority');
      expect(text).not.toContain('False Positives / Keep as-is');
    }
  });

  it('reviewer agent loads review skills and forbids mutation', () => {
    const text = readFileSync('agents/implementation-reviewer.md', 'utf8');

    expect(text).toContain('name: implementation-reviewer');
    expect(text).toContain('skills: review-implementation, review-architecture, review-tests, review-data-flow, review-security');
    expect(text).toContain('Inspect whole-tree context; review acceptance scope, not active changeset');
    expect(text).toContain('Treat diff/changed files as discovery seeds only, never boundaries');
    expect(text).toContain('Do not restrict findings to changed files or changed lines; do not apply diff-overlap rules');
    expect(text.toLowerCase()).toContain('accepted exceptions');
    expect(text).toContain('path/to/file.ts:42: 🔴 blocker');
    expect(text).toContain('totals: 1🔴 1🟡 0🔵 1❓ 1✅');
    expect(text).toContain('Review only; do not edit files');
    expect(text).toContain('Do not commit, push, create PRs, archive, deploy, or run branch-finishing workflows');
  });
});
