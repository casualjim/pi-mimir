import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import cavemanExtension from '../extensions/caveman/index.js';
import { clearModeState, getModeStatePath, readModeState, safeWriteMode } from '../extensions/caveman/mode-state.js';

type Handler = (event: Record<string, any>, ctx: Record<string, any>) => any | Promise<any>;

function createHarness() {
  const handlers = new Map<string, Handler[]>();
  const sentMessages: Array<{ customType: string; content: string; display?: boolean }> = [];
  const pi = {
    on(name: string, handler: Handler) {
      const list = handlers.get(name) ?? [];
      list.push(handler);
      handlers.set(name, list);
    },
    sendMessage(message: { customType: string; content: string; display?: boolean }) {
      sentMessages.push(message);
    },
  };

  async function emit(name: string, event: Record<string, any> = {}) {
    let result: any;
    for (const handler of handlers.get(name) ?? []) {
      result = await handler({ type: name, ...event }, { cwd: process.cwd() });
    }
    return result;
  }

  cavemanExtension(pi as any);
  return { emit, handlers, sentMessages };
}

const oldEnv = { ...process.env };
const tempDirs: string[] = [];

function useTempConfigDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pi-caveman-test-'));
  tempDirs.push(dir);
  process.env.PI_CAVEMAN_CONFIG_DIR = dir;
  delete process.env.CAVEMAN_DEFAULT_MODE;
  return dir;
}

afterEach(async () => {
  process.env = { ...oldEnv };
  for (const dir of tempDirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

describe('Pi Caveman extension hooks', () => {
  it('activates default caveman mode on session start and injects rules', async () => {
    useTempConfigDir();
    const harness = createHarness();

    await harness.emit('session_start');

    expect(readModeState()).toBe('full');
    expect(harness.sentMessages).toHaveLength(1);
    expect(harness.sentMessages[0]).toMatchObject({ customType: 'caveman-rules', display: false });
    expect(harness.sentMessages[0].content).toContain('CAVEMAN MODE ACTIVE');
    expect(harness.sentMessages[0].content).toContain('level: full');
  });

  it('honors off default mode without injection', async () => {
    useTempConfigDir();
    process.env.CAVEMAN_DEFAULT_MODE = 'off';
    const harness = createHarness();

    await harness.emit('session_start');

    expect(readModeState()).toBeNull();
    expect(harness.sentMessages).toHaveLength(0);
  });

  it('tracks skill and natural-language mode changes before each agent turn', async () => {
    useTempConfigDir();
    const harness = createHarness();

    await harness.emit('input', { text: '/skill:caveman ultra', source: 'interactive' });
    expect(readModeState()).toBe('ultra');

    const result = await harness.emit('before_agent_start', { systemPrompt: 'base prompt' });
    expect(result.systemPrompt).toContain('base prompt');
    expect(result.systemPrompt).toContain('CAVEMAN MODE ACTIVE (ultra)');
    expect(result.message).toBeUndefined();

    await harness.emit('input', { text: 'normal mode', source: 'interactive' });
    expect(readModeState()).toBeNull();
    expect(await harness.emit('before_agent_start', { systemPrompt: 'base prompt' })).toBeUndefined();

    await harness.emit('input', { text: 'please use caveman mode', source: 'interactive' });
    expect(readModeState()).toBe('full');
  });

  it('records independent modes without injecting base reply rules', async () => {
    useTempConfigDir();
    const harness = createHarness();

    await harness.emit('input', { text: '/skill:caveman-commit', source: 'interactive' });

    expect(readModeState()).toBe('commit');
    expect(await harness.emit('before_agent_start', { systemPrompt: 'base prompt' })).toBeUndefined();
  });

  it('does not mutate Claude config paths when activating Pi hooks', async () => {
    const dir = useTempConfigDir();
    const home = join(dir, 'home');
    const claudeDir = join(dir, 'claude-config');
    process.env.HOME = home;
    process.env.CLAUDE_CONFIG_DIR = claudeDir;
    const harness = createHarness();

    await harness.emit('session_start');

    expect(existsSync(join(home, '.claude'))).toBe(false);
    expect(existsSync(claudeDir)).toBe(false);
  });

  it('uses safe mode state: valid enum only, symlink refused, oversize ignored', async () => {
    const dir = useTempConfigDir();
    const statePath = getModeStatePath();
    const target = join(dir, 'target');
    writeFileSync(target, 'secret');
    symlinkSync(target, statePath);

    safeWriteMode('ultra');
    expect(readFileSync(target, 'utf8')).toBe('secret');
    expect(readModeState()).toBeNull();

    await rm(statePath, { force: true });
    await writeFile(statePath, 'x'.repeat(128));
    expect(readModeState()).toBeNull();

    await writeFile(statePath, 'not-a-mode');
    expect(readModeState()).toBeNull();

    clearModeState();
    expect(existsSync(statePath)).toBe(false);
  });
});
