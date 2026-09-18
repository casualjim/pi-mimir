import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import headroomExtension from '../extensions/headroom.js';

interface Captured {
  tools: Array<{ name: string; loadMode?: string; approval?: string; execute: (...args: unknown[]) => Promise<unknown> }>;
  commands: string[];
}

function stubPi(): { pi: ExtensionAPI; captured: Captured } {
  const captured: Captured = { tools: [], commands: [] };
  const pi = {
    on: vi.fn(),
    registerMessageRenderer: vi.fn(),
    registerCommand: (name: string) => { captured.commands.push(name); },
    registerTool: (def: Captured['tools'][number]) => { captured.tools.push(def); },
  } as unknown as ExtensionAPI;
  return { pi, captured };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('headroom extension', () => {
  it('registers headroom_retrieve plus the /headroom commands', () => {
    const { pi, captured } = stubPi();
    headroomExtension(pi);
    expect(captured.tools.map((t) => t.name)).toEqual(['headroom_retrieve']);
    expect(captured.commands).toContain('headroom');
  });

  it('declares omp placement and approval for the retrieve tool', () => {
    const { pi, captured } = stubPi();
    headroomExtension(pi);
    expect(captured.tools[0]).toMatchObject({ loadMode: 'essential', approval: 'read' });
  });

  it('rejects malformed hashes without calling the proxy', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { pi, captured } = stubPi();
    headroomExtension(pi);
    const result = await captured.tools[0].execute('call_1', { hash: 'nope' }, undefined, undefined, {});
    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).toContain('Invalid hash');
  });

  it('returns original_content for a valid hash', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      hash: 'abc123abc123',
      original_content: 'full original text',
    }), { status: 200 })));
    const { pi, captured } = stubPi();
    headroomExtension(pi);
    const result = await captured.tools[0].execute('call_1', { hash: 'abc123abc123' }, undefined, undefined, {});
    expect(JSON.stringify(result)).toContain('full original text');
  });
});
