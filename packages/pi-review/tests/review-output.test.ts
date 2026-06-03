import { describe, expect, it } from 'vitest';
import { isReviewOutput } from '../extensions/review/review-output.js';

describe('review output schema', () => {
  it('accepts Codex-style structured output', () => {
    expect(isReviewOutput({
      findings: [{
        title: '[P1] Keep changed line location',
        body: 'This fails for changed inputs.',
        confidence_score: 0.88,
        priority: 1,
        code_location: {
          absolute_file_path: '/repo/src/file.ts',
          line_range: { start: 10, end: 10 },
        },
      }],
      overall_correctness: 'patch is incorrect',
      overall_explanation: 'Finding breaks existing behavior.',
      overall_confidence_score: 0.8,
    })).toBe(true);
  });

  it('rejects missing overall verdict or invalid scores', () => {
    expect(isReviewOutput({ findings: [], overall_explanation: '', overall_confidence_score: 0.5 })).toBe(false);
    expect(isReviewOutput({ findings: [], overall_correctness: 'patch is correct', overall_explanation: '', overall_confidence_score: 2 })).toBe(false);
  });
});
