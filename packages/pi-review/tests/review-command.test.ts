import { describe, expect, it } from 'vitest';
import { registerReviewCommand } from '../extensions/review/review-command.js';

type Command = { description: string; handler(args: unknown, ctx: unknown): Promise<void> };

function createPiHarness(sentPrompts: string[]) {
  const commands = new Map<string, Command>();
  const pi = {
    registerCommand(name: string, command: Command) {
      commands.set(name, command);
    },
    sendUserMessage(prompt: string) {
      sentPrompts.push(prompt);
    },
  };
  return { pi, commands };
}

describe('review command', () => {
  it('registers /review and starts an agent turn with the rendered prompt', async () => {
    const sentPrompts: string[] = [];
    const notifications: Array<{ message: string; level?: string }> = [];
    const { pi, commands } = createPiHarness(sentPrompts);

    registerReviewCommand(pi as never);
    expect(commands.has('review')).toBe(true);

    await commands.get('review')?.handler('--base main', {
      cwd: '/repo',
      hasUI: true,
      ui: { notify: (message: string, level?: string) => notifications.push({ message, level }) },
    });

    expect(sentPrompts).toHaveLength(1);
    expect(sentPrompts[0]).toContain('## Review target');
    expect(sentPrompts[0]).toContain('Review changes against base branch `main`.');
    expect(sentPrompts[0]).not.toContain('## Pi exploration requirements');
    expect(notifications).toEqual([{ message: 'Starting /review --base main.', level: 'info' }]);
  });

  it('reports target validation errors instead of sending prompt', async () => {
    const sentPrompts: string[] = [];
    const notifications: Array<{ message: string; level?: string }> = [];
    const { pi, commands } = createPiHarness(sentPrompts);

    registerReviewCommand(pi as never);
    await commands.get('review')?.handler('--commit', {
      cwd: '/repo',
      hasUI: true,
      ui: { notify: (message: string, level?: string) => notifications.push({ message, level }) },
    });

    expect(sentPrompts).toHaveLength(0);
    expect(notifications).toEqual([{ message: '/review requires non-empty commit SHA.', level: 'error' }]);
  });
});
