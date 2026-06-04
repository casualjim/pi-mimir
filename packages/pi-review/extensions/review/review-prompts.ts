import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type ReviewTarget =
  | { kind: 'uncommitted' }
  | { kind: 'base'; branch: string }
  | { kind: 'commit'; sha: string }
  | { kind: 'custom'; instructions: string };

export function parseReviewArgs(args: unknown): ReviewTarget {
  const tokens = normalizeArgs(args);
  if (tokens.length === 0) return { kind: 'uncommitted' };

  const [head, ...rest] = tokens;
  switch (head) {
    case '--base':
    case 'base':
      return { kind: 'base', branch: requireOne(rest, 'branch') };
    case '--commit':
    case 'commit':
      return { kind: 'commit', sha: requireOne(rest, 'commit SHA') };
    case '--custom':
    case 'custom':
      return { kind: 'custom', instructions: requireText(rest, 'custom instructions') };
    default:
      return { kind: 'custom', instructions: tokens.join(' ') };
  }
}

export function buildReviewPrompt(target: ReviewTarget, _cwd: string): string {
  return [
    'Use the `cavecrew` skill workflow for this request.',
    '',
    '## Mandatory delegation',
    '- Load `cavecrew` before reviewing.',
    '- Use the `subagent` tool; first list available agents.',
    '- Delegate exactly one review task to executable `cavecrew-reviewer`.',
    '- If `cavecrew-reviewer` is missing or disabled, report `cavecrew-reviewer unavailable` and stop.',
    '- Do not review in the parent thread except to relay the reviewer result.',
    '- Return the reviewer output in readable cavecrew-reviewer format; do not return raw JSON.',
    '',
    '## Reviewer task',
    targetInstructions(target),
    '',
    'Apply the Codex review rules below. Keep bug-selection, priority, and line-range rules.',
    'Do not use Codex JSON output schema; it is intentionally removed to avoid conflicting with cavecrew-reviewer.',
    '',
    loadCodexReviewRules(),
    '',
    '## Severity mapping',
    '- P0/P1 → 🔴 bug',
    '- P2 → 🟡 risk',
    '- P3 → 🔵 nit',
    '',
    '## Final output for Pi',
    'Return only cavecrew-reviewer lines (`path:line: <emoji> <severity>: problem. fix.`) or `No issues.`.',
    'Raw JSON is forbidden.',
  ].join('\n');
}

export function targetInstructions(target: ReviewTarget): string {
  switch (target.kind) {
    case 'uncommitted':
      return [
        'Review all uncommitted changes in the working tree.',
        'Inspect staged, unstaged, and untracked files.',
        'Use `git status --short`, `git diff --staged`, `git diff`, and exact file reads as needed.',
      ].join('\n');
    case 'base':
      return [
        `Review changes against base branch \`${target.branch}\`.`,
        `Find the merge base with \`${target.branch}\`, then inspect \`git diff <merge-base>\`.`,
      ].join('\n');
    case 'commit':
      return [
        `Review only changes introduced by commit \`${target.sha}\`.`,
        `Inspect \`git show --stat --patch ${target.sha}\` and exact files as needed.`,
      ].join('\n');
    case 'custom':
      return [
        'Review according to these custom instructions:',
        target.instructions,
      ].join('\n');
  }
}

export function normalizeArgs(args: unknown): string[] {
  if (Array.isArray(args)) return args.map(String).filter((arg) => arg.length > 0);
  if (typeof args === 'string') return splitShellLike(args);
  if (args && typeof args === 'object' && 'args' in args) return normalizeArgs((args as { args?: unknown }).args);
  return [];
}

function requireOne(values: string[], label: string): string {
  const value = values[0]?.trim();
  if (!value) throw new Error(`/review requires non-empty ${label}.`);
  return value;
}

function requireText(values: string[], label: string): string {
  const text = values.join(' ').trim();
  if (!text) throw new Error(`/review requires non-empty ${label}.`);
  return text;
}

function splitShellLike(input: string): string[] {
  const tokens = input.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
  return tokens.map((token) => token.replace(/^(['"])(.*)\1$/, '$2')).filter((token) => token.length > 0);
}

let cachedRules: string | undefined;

function loadCodexReviewRules(): string {
  cachedRules ??= stripCodexOutputFormat(
    readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../prompts/review_prompt.md'), 'utf8').trim(),
  );
  return cachedRules;
}

function stripCodexOutputFormat(prompt: string): string {
  const jsonPriorityStart = prompt.indexOf('Additionally, include a numeric priority field in the JSON output');
  if (jsonPriorityStart >= 0) return prompt.slice(0, jsonPriorityStart).trim();

  const outputFormatStart = prompt.indexOf('OUTPUT FORMAT:');
  if (outputFormatStart >= 0) return prompt.slice(0, outputFormatStart).trim();

  return prompt.trim();
}
