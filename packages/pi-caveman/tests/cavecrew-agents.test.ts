import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  BUNDLED_AGENTS_DIR,
  CAVEMAN_MANAGED_MANIFEST,
  syncBundledCavecrewAgents,
} from '../extensions/caveman/agents.js';

const root = path.resolve(import.meta.dirname, '..');

function sha256(content: Buffer | string): string {
  return createHash('sha256').update(content).digest('hex');
}

function cavecrewAgentNames(): string[] {
  return readdirSync(BUNDLED_AGENTS_DIR).filter((name) => /^cavecrew-[a-z0-9-]+\.md$/.test(name)).sort();
}

function toolsLine(name: string): string {
  const content = readFileSync(path.join(BUNDLED_AGENTS_DIR, name), 'utf8');
  return content.match(/^tools:\s*(.+)$/m)?.[1].trim() ?? '';
}

describe('Cavecrew managed agents', () => {
  let cwd: string;
  let previousAgentDir: string | undefined;

  beforeEach(() => {
    cwd = path.join(tmpdir(), `pi-caveman-agents-test-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    previousAgentDir = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = cwd;
    mkdirSync(cwd, { recursive: true });
  });

  afterEach(() => {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    rmSync(cwd, { recursive: true, force: true });
  });

  it('syncs cavecrew agents to user agent dir with content-hash manifest', () => {
    const result = syncBundledCavecrewAgents();
    const expected = cavecrewAgentNames();

    expect(result.added.sort()).toEqual(expected);
    expect(result.updated).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(result.errors).toEqual([]);

    const userAgentDir = path.join(cwd, 'agents');
    for (const name of expected) expect(existsSync(path.join(userAgentDir, name))).toBe(true);

    const manifest = JSON.parse(readFileSync(path.join(cwd, CAVEMAN_MANAGED_MANIFEST), 'utf8')) as Record<string, string>;
    expect(Object.keys(manifest).sort()).toEqual(expected);
    for (const name of expected) {
      expect(manifest[name]).toBe(sha256(readFileSync(path.join(BUNDLED_AGENTS_DIR, name))));
    }
  });

  it('preserves user-modified managed agents and drops ownership', () => {
    const userAgentDir = path.join(cwd, 'agents');
    mkdirSync(userAgentDir, { recursive: true });
    writeFileSync(path.join(userAgentDir, 'cavecrew-reviewer.md'), '# user modified\n', 'utf8');
    writeFileSync(path.join(cwd, CAVEMAN_MANAGED_MANIFEST), JSON.stringify({
      'cavecrew-reviewer.md': sha256('# previous managed\n'),
    }), 'utf8');

    const result = syncBundledCavecrewAgents();
    const manifest = JSON.parse(readFileSync(path.join(cwd, CAVEMAN_MANAGED_MANIFEST), 'utf8')) as Record<string, string>;

    expect(result.updated).not.toContain('cavecrew-reviewer.md');
    expect(readFileSync(path.join(userAgentDir, 'cavecrew-reviewer.md'), 'utf8')).toContain('user modified');
    expect(manifest['cavecrew-reviewer.md']).toBeUndefined();
  });

  it('removes stale unchanged managed agents', () => {
    const userAgentDir = path.join(cwd, 'agents');
    mkdirSync(userAgentDir, { recursive: true });
    const content = '# old managed\n';
    writeFileSync(path.join(userAgentDir, 'cavecrew-old.md'), content, 'utf8');
    writeFileSync(path.join(cwd, CAVEMAN_MANAGED_MANIFEST), JSON.stringify({
      'cavecrew-old.md': sha256(content),
    }), 'utf8');

    const result = syncBundledCavecrewAgents();

    expect(result.removed).toContain('cavecrew-old.md');
    expect(existsSync(path.join(userAgentDir, 'cavecrew-old.md'))).toBe(false);
  });
});

describe('Cavecrew Pi-subagents contract', () => {
  it('uses Pi tool names and codebase-memory-first investigator ladder', () => {
    expect(toolsLine('cavecrew-investigator.md')).toBe('read, bash, codebase_memory_get_architecture, codebase_memory_search_graph, codebase_memory_search_code, codebase_memory_trace_path, codebase_memory_get_code_snippet, codebase_memory_get_graph_schema, codebase_memory_index_status');
    expect(toolsLine('cavecrew-builder.md')).toBe('read, edit, write');
    expect(toolsLine('cavecrew-reviewer.md')).toBe('read, bash');

    for (const name of cavecrewAgentNames()) {
      const content = readFileSync(path.join(BUNDLED_AGENTS_DIR, name), 'utf8');
      expect(content).not.toMatch(/tools:\s*\[/);
      expect(content).not.toMatch(/\b(Read|Grep|Glob|Bash|Edit|Write)\b/);
    }

    const investigator = readFileSync(path.join(BUNDLED_AGENTS_DIR, 'cavecrew-investigator.md'), 'utf8');
    expect(investigator).toContain('codebase_memory_get_architecture');
    expect(investigator).toContain('degraded: codebase-memory unavailable; using read/bash.');
  });

  it('documents explicit delegation and forbids extension auto-spawn', () => {
    const skill = readFileSync(path.join(root, 'skills/cavecrew/SKILL.md'), 'utf8');
    const readme = readFileSync(path.join(root, 'README.md'), 'utf8');
    const extension = readFileSync(path.join(root, 'extensions/caveman/index.ts'), 'utf8');

    expect(skill).toContain('{ "action": "list" }');
    expect(skill).toContain('{ "agent": "cavecrew-investigator"');
    expect(skill).toContain('Never auto-spawn Cavecrew from extension hooks.');
    expect(readme).toContain('does not auto-spawn agents');
    expect(extension).not.toContain('subagent');
  });
});
