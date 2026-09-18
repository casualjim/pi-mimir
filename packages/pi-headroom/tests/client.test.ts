import { afterEach, describe, expect, it, vi } from 'vitest';
import { HeadroomHttpClient } from '../extensions/client.js';

function client() {
  return new HeadroomHttpClient({ baseUrl: 'http://127.0.0.1:8788/', timeoutMs: 1000 });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HeadroomHttpClient.retrieve', () => {
  it('prefers original_content from the proxy envelope', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      hash: 'abc123abc123',
      original_content: 'the full original',
      original_tokens: 42,
    }), { status: 200 })));

    const result = await client().retrieve('abc123abc123');
    expect(result).toEqual({ ok: true, content: 'the full original' });
  });

  it('accepts a bare string body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify('bare original'), { status: 200 })));
    const result = await client().retrieve('abc123abc123');
    expect(result).toEqual({ ok: true, content: 'bare original' });
  });

  it('maps 404 to an expiry hint', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"detail":"Entry not found (CCR TTL: 1800 seconds)"}', { status: 404 })));
    const result = await client().retrieve('abc123abc123');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
      expect(result.error).toContain('TTL');
    }
  });

  it('returns an error result on network failure instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('connect ECONNREFUSED'); }));
    const result = await client().retrieve('abc123abc123');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('ECONNREFUSED');
  });
});
