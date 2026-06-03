import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { syncBundledReviewAgents } from './agents.js';
import { registerReviewCommand } from './review-command.js';

export default function reviewExtension(pi: ExtensionAPI): void {
  registerReviewCommand(pi);
  pi.on('session_start', async () => {
    syncBundledReviewAgents();
  });
}

export { syncBundledReviewAgents } from './agents.js';
export { buildReviewPrompt, parseReviewArgs, targetInstructions } from './review-prompts.js';
export { isReviewOutput } from './review-output.js';
