import { describe, expect, it } from 'vitest';
import extension from '../extensions/review/index.js';

describe('review extension entry point', () => {
  it('registers /review and session_start agent sync', () => {
    const commands = new Map<string, unknown>();
    const handlers = new Map<string, unknown>();
    const pi = {
      registerCommand(name: string, command: unknown) {
        commands.set(name, command);
      },
      on(event: string, handler: unknown) {
        handlers.set(event, handler);
      },
    };

    extension(pi as never);

    expect(commands.has('review')).toBe(true);
    expect(handlers.has('session_start')).toBe(true);
  });
});
