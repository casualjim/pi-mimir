import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BUNDLED_AGENTS_DIR, REVIEW_MANAGED_MANIFEST, syncBundledReviewAgents } from '../extensions/review/agents.js';

function fileHash(content: string): string {
  return createHash('sha256').update(Buffer.from(content)).digest('hex');
}

describe('review agent sync', () => {
  let cwd: string;
  let userAgentDir: string;
  let previousAgentDir: string | undefined;

  beforeEach(() => {
    cwd = join(tmpdir(), `pi-review-agent-test-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    userAgentDir = join(cwd, 'agents');
    previousAgentDir = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = cwd;
    mkdirSync(cwd, { recursive: true });
  });

  afterEach(() => {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    rmSync(cwd, { recursive: true, force: true });
  });

  it('syncs bundled implementation reviewer to the user agent directory', () => {
    const result = syncBundledReviewAgents();
    const agent = join(userAgentDir, 'implementation-reviewer.md');

    expect(result.added).toEqual(['implementation-reviewer.md']);
    expect(result.errors).toEqual([]);
    expect(readFileSync(agent, 'utf8')).toBe(readFileSync(join(BUNDLED_AGENTS_DIR, 'implementation-reviewer.md'), 'utf8'));

    const manifest = JSON.parse(readFileSync(join(cwd, REVIEW_MANAGED_MANIFEST), 'utf8')) as Record<string, string>;
    expect(manifest['implementation-reviewer.md']).toBe(fileHash(readFileSync(agent, 'utf8')));
  });

  it('preserves user-modified agents and drops them from manifest', () => {
    mkdirSync(userAgentDir, { recursive: true });
    writeFileSync(join(userAgentDir, 'implementation-reviewer.md'), '# user modified\n', 'utf8');
    writeFileSync(join(cwd, REVIEW_MANAGED_MANIFEST), JSON.stringify({ 'implementation-reviewer.md': fileHash('# previous managed\n') }), 'utf8');

    const result = syncBundledReviewAgents();
    const manifest = JSON.parse(readFileSync(join(cwd, REVIEW_MANAGED_MANIFEST), 'utf8')) as Record<string, string>;

    expect(result.updated).not.toContain('implementation-reviewer.md');
    expect(readFileSync(join(userAgentDir, 'implementation-reviewer.md'), 'utf8')).toContain('user modified');
    expect(manifest['implementation-reviewer.md']).toBeUndefined();
  });
});
