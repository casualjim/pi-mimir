import { describe, expect, it } from 'vitest';
import type { ContextEvent } from '@earendil-works/pi-coding-agent';
import {
  buildCompressionPayload,
  injectCompressionAwareness,
  naturalizeHeadroomMarkers,
} from '../extensions/bridge.js';

type AgentMessage = ContextEvent['messages'][number];

const readTurn = [
  { role: 'user', content: [{ type: 'text', text: 'read the file' }] },
  {
    role: 'assistant',
    content: [
      { type: 'text', text: '' },
      { type: 'toolCall', id: 'call_1', name: 'read', arguments: { path: 'x.ts' } },
    ],
  },
  {
    role: 'toolResult',
    toolCallId: 'call_1',
    toolName: 'read',
    content: [{ type: 'text', text: 'x'.repeat(3000) }],
  },
] as unknown as AgentMessage[];

describe('naturalizeHeadroomMarkers', () => {
  it('keeps the hash and names headroom_retrieve for legacy markers', () => {
    const out = naturalizeHeadroomMarkers(
      '[400 items compressed to 10. Retrieve more: hash=2b1f97138886d3c56c3e28de]',
    );
    expect(out).toContain('headroom_retrieve');
    expect(out).toContain('hash=2b1f97138886d3c56c3e28de');
    expect(out).not.toContain('offset');
  });

  it('rewrites Retrieve original markers (read lifecycle)', () => {
    const out = naturalizeHeadroomMarkers(
      '[Read content stale: Retrieve original: hash=abcdef123456]',
    );
    expect(out).toContain('headroom_retrieve');
    expect(out).toContain('hash=abcdef123456');
  });

  it('leaves <<ccr:...>> machine markers byte-intact', () => {
    const json = '{"_ccr_dropped":"<<ccr:abc123abc123 3900_rows_offloaded>>"}';
    expect(naturalizeHeadroomMarkers(json)).toBe(json);
  });
});

describe('injectCompressionAwareness', () => {
  it('injects a hint naming the retrieve tool once', () => {
    const once = injectCompressionAwareness([] as unknown as AgentMessage[]);
    const twice = injectCompressionAwareness(once);
    expect(once[0]).toMatchObject({ role: 'system' });
    expect(String((once[0] as { content: string }).content)).toContain('headroom_retrieve');
    expect(twice.length).toBe(once.length);
  });
});

describe('buildCompressionPayload rename knob', () => {
  it('renames tool calls to pi_tool_result by default', () => {
    const payload = buildCompressionPayload(readTurn, 2000);
    const assistant = payload.messages.find((m) => m.role === 'assistant');
    expect(assistant && 'tool_calls' in assistant ? assistant.tool_calls?.[0]?.function.name : undefined)
      .toBe('pi_tool_result');
    expect(payload.candidateCount).toBe(1);
  });

  it('keeps original tool names when renameToolCalls is false', () => {
    const payload = buildCompressionPayload(readTurn, 2000, { renameToolCalls: false });
    const assistant = payload.messages.find((m) => m.role === 'assistant');
    expect(assistant && 'tool_calls' in assistant ? assistant.tool_calls?.[0]?.function.name : undefined)
      .toBe('read');
  });
});
