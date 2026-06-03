import { describe, expect, it } from 'vitest';
import {
  buildAdrIngestionPrompt,
  getToolInputPath,
  isAdrWriteResult,
  projectNameFromCwd,
} from '../extensions/codebase-memory/adr-watcher.js';

describe('ADR watcher', () => {
  it('detects successful write/edit results targeting docs/adr markdown files', () => {
    expect(isAdrWriteResult({ toolName: 'write', input: { path: 'docs/adr/0001-test.md' } })).toBe(true);
    expect(isAdrWriteResult({ toolName: 'edit', input: { path: '/repo/docs/adr/0002-test.md' } })).toBe(true);
  });

  it('ignores failed tool results, non-ADR paths, and unrelated tools', () => {
    expect(isAdrWriteResult({ toolName: 'write', input: { path: 'docs/adr/0001-test.md' }, isError: true })).toBe(false);
    expect(isAdrWriteResult({ toolName: 'write', input: { path: 'docs/design.md' } })).toBe(false);
    expect(isAdrWriteResult({ toolName: 'read', input: { path: 'docs/adr/0001-test.md' } })).toBe(false);
  });

  it('extracts string paths from tool input', () => {
    expect(getToolInputPath({ path: 'docs/adr/0001-test.md' })).toBe('docs/adr/0001-test.md');
    expect(getToolInputPath({ path: '' })).toBeUndefined();
    expect(getToolInputPath({})).toBeUndefined();
  });

  it('derives codebase-memory project names from cwd paths', () => {
    expect(projectNameFromCwd('/home/ivan/github/casualjim/pi-mimir')).toBe('home-ivan-github-casualjim-pi-mimir');
    expect(projectNameFromCwd('/home/ivan/github/Fission-AI/Openspec')).toBe('home-ivan-github-Fission-AI-Openspec');
  });

  it('builds follow-up prompt for codebase_memory_manage_adr', () => {
    const prompt = buildAdrIngestionPrompt('docs/adr/0001-test.md', '/home/ivan/github/casualjim/pi-mimir');

    expect(prompt).toContain('docs/adr/0001-test.md');
    expect(prompt).toContain('codebase_memory_manage_adr');
    expect(prompt).toContain('project "home-ivan-github-casualjim-pi-mimir"');
    expect(prompt).toContain('mode "update"');
  });
});
