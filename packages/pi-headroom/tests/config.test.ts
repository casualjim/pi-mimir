import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import {
  detectHeadroomHost,
  isRemoteBlocked,
  loadHeadroomConfig,
  resolveHeadroomSettingsFile,
} from '../extensions/config.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('host resolution', () => {
  it('detects omp via the zod capability probe', () => {
    expect(detectHeadroomHost({ zod: {} })).toBe('omp');
    expect(detectHeadroomHost({})).toBe('pi');
    expect(detectHeadroomHost(undefined)).toBe('pi');
  });

  it('resolves host-default settings files side by side', () => {
    expect(resolveHeadroomSettingsFile('pi', {})).toBe(path.join(homedir(), '.pi', 'agent', 'headroom', 'settings.json'));
    expect(resolveHeadroomSettingsFile('omp', {})).toBe(path.join(homedir(), '.omp', 'agent', 'headroom', 'settings.json'));
  });

  it('honours PI_CODING_AGENT_DIR and PI_HEADROOM_SETTINGS overrides', () => {
    expect(resolveHeadroomSettingsFile('omp', { PI_CODING_AGENT_DIR: '/tmp/omp-agent' })).toBe(
      '/tmp/omp-agent/headroom/settings.json',
    );
    expect(resolveHeadroomSettingsFile('pi', { PI_CODING_AGENT_DIR: '/tmp/pi-agent' })).toBe(
      '/tmp/pi-agent/headroom/settings.json',
    );
    expect(resolveHeadroomSettingsFile('pi', { PI_HEADROOM_SETTINGS: '/tmp/headroom.json' })).toBe('/tmp/headroom.json');
  });

  it('loads the resolved host settings file', () => {
    const agentDir = mkdtempSync(path.join(tmpdir(), 'pi-headroom-agent-'));
    mkdirSync(path.join(agentDir, 'headroom'), { recursive: true });
    writeFileSync(
      path.join(agentDir, 'headroom', 'settings.json'),
      JSON.stringify({ baseUrl: 'http://127.0.0.1:9999' }),
      'utf-8',
    );
    vi.stubEnv('PI_CODING_AGENT_DIR', agentDir);
    expect(loadHeadroomConfig(process.env, undefined, 'omp').baseUrl).toBe('http://127.0.0.1:9999');
    expect(loadHeadroomConfig(process.env, undefined, 'pi').baseUrl).toBe('http://127.0.0.1:9999');
  });
});

describe('loadHeadroomConfig', () => {
  it('defaults renameToolCalls to true and drops autoStart/command', () => {
    const config = loadHeadroomConfig({} as NodeJS.ProcessEnv, {});
    expect(config.renameToolCalls).toBe(true);
    expect('autoStart' in config).toBe(false);
    expect('command' in config).toBe(false);
    expect(config.baseUrl).toBe('http://127.0.0.1:8787');
  });

  it('settings beat env, env beats defaults', () => {
    const env = { PI_HEADROOM_URL: 'http://127.0.0.1:9999', PI_HEADROOM_RENAME_TOOL_CALLS: '0' } as NodeJS.ProcessEnv;
    const fromEnv = loadHeadroomConfig(env, {});
    expect(fromEnv.baseUrl).toBe('http://127.0.0.1:9999');
    expect(fromEnv.renameToolCalls).toBe(false);

    const fromSettings = loadHeadroomConfig(env, { baseUrl: 'http://127.0.0.1:8777/', renameToolCalls: true });
    expect(fromSettings.baseUrl).toBe('http://127.0.0.1:8777');
    expect(fromSettings.renameToolCalls).toBe(true);
  });

  it('blocks remote URLs unless allowRemote', () => {
    expect(isRemoteBlocked({ baseUrl: 'https://example.com', allowRemote: false })).toBe(true);
    expect(isRemoteBlocked({ baseUrl: 'http://127.0.0.1:8788', allowRemote: false })).toBe(false);
    expect(isRemoteBlocked({ baseUrl: 'https://example.com', allowRemote: true })).toBe(false);
  });
});
