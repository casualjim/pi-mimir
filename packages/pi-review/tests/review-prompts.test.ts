import { describe, expect, it } from 'vitest';
import { buildReviewPrompt, parseReviewArgs, targetInstructions } from '../extensions/review/review-prompts.js';

describe('review target parsing', () => {
  it('defaults to uncommitted changes', () => {
    expect(parseReviewArgs('')).toEqual({ kind: 'uncommitted' });
    expect(parseReviewArgs([])).toEqual({ kind: 'uncommitted' });
  });

  it('parses base branch target', () => {
    expect(parseReviewArgs('--base main')).toEqual({ kind: 'base', branch: 'main' });
    expect(parseReviewArgs(['base', 'origin/main'])).toEqual({ kind: 'base', branch: 'origin/main' });
  });

  it('parses commit target', () => {
    expect(parseReviewArgs('--commit abc123')).toEqual({ kind: 'commit', sha: 'abc123' });
  });

  it('parses custom target', () => {
    expect(parseReviewArgs('--custom check API compatibility')).toEqual({ kind: 'custom', instructions: 'check API compatibility' });
    expect(parseReviewArgs('check data flow')).toEqual({ kind: 'custom', instructions: 'check data flow' });
  });

  it('rejects empty required target arguments', () => {
    expect(() => parseReviewArgs('--base')).toThrow('/review requires non-empty branch.');
    expect(() => parseReviewArgs('--commit')).toThrow('/review requires non-empty commit SHA.');
    expect(() => parseReviewArgs('--custom')).toThrow('/review requires non-empty custom instructions.');
  });
});

describe('review prompt rendering', () => {
  it('delegates through cavecrew-reviewer while preserving Codex review rules', () => {
    const prompt = buildReviewPrompt({ kind: 'uncommitted' }, '/repo');

    expect(prompt).toContain('Use the `cavecrew` skill workflow');
    expect(prompt).toContain('Delegate exactly one review task to executable `cavecrew-reviewer`');
    expect(prompt).toContain('Do not invoke the `review-implementation` skill.');
    expect(prompt).toContain('do not return raw JSON');
    expect(prompt).toContain('You are acting as a reviewer for a proposed code change');
    expect(prompt).toContain('Output all findings that the original author would fix if they knew about it');
    expect(prompt).toContain('Review all uncommitted changes');
  });

  it('removes Codex JSON output schema before cavecrew delegation', () => {
    const prompt = buildReviewPrompt({ kind: 'uncommitted' }, '/repo');

    expect(prompt).toContain('## Severity mapping');
    expect(prompt).toContain('P0/P1 → 🔴 bug');
    expect(prompt).toContain('P2 → 🟡 risk');
    expect(prompt).toContain('P3 → 🔵 nit');
    expect(prompt).not.toContain('OUTPUT FORMAT:');
    expect(prompt).not.toContain('"overall_correctness"');
    expect(prompt).not.toContain('"findings"');
    expect(prompt).not.toContain('numeric priority field in the JSON output');
    expect(prompt).not.toContain('Do not wrap the JSON');
  });

  it('renders target-specific diff instructions', () => {
    expect(targetInstructions({ kind: 'base', branch: 'main' })).toContain('git diff <merge-base>');
    expect(targetInstructions({ kind: 'commit', sha: 'abc123' })).toContain('git show --stat --patch abc123');
    expect(targetInstructions({ kind: 'custom', instructions: 'focus security' })).toContain('focus security');
  });

  it('keeps old Pi integration guidance out of the review prompt', () => {
    const prompt = buildReviewPrompt({ kind: 'uncommitted' }, '/repo');

    expect(prompt).toContain('## Reviewer task');
    expect(prompt).not.toContain('## Pi /review target');
    expect(prompt).not.toContain('## Pi exploration requirements');
    expect(prompt).not.toContain('Repository root: /repo');
    expect(prompt).not.toContain('Use codebase-memory first');
    expect(prompt).not.toContain('state degraded discovery');
  });
});
