import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { buildReviewPrompt, parseReviewArgs } from './review-prompts.js';

type CommandContext = {
  cwd: string;
  hasUI?: boolean;
  ui?: {
    notify(message: string, level?: 'info' | 'warning' | 'error'): void;
  };
};

export function registerReviewCommand(pi: ExtensionAPI): void {
  pi.registerCommand('review', {
    description: 'Review code changes with Codex-style structured findings',
    handler: async (args: unknown, ctx: CommandContext) => {
      try {
        const target = parseReviewArgs(args);
        const prompt = buildReviewPrompt(target, ctx.cwd);
        notify(ctx, `Starting ${formatCommand(args)}.`, 'info');
        pi.sendUserMessage(prompt);
      } catch (error) {
        notify(ctx, error instanceof Error ? error.message : String(error), 'error');
      }
    },
  });
}

function notify(ctx: CommandContext, message: string, level: 'info' | 'warning' | 'error'): void {
  if (ctx.hasUI && ctx.ui) ctx.ui.notify(message, level);
}

function formatCommand(args: unknown): string {
  if (Array.isArray(args)) return args.length > 0 ? `/review ${args.map(String).join(' ')}` : '/review';
  if (typeof args === 'string') return args.trim() ? `/review ${args.trim()}` : '/review';
  return '/review';
}
