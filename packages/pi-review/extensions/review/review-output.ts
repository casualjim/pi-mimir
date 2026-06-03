export interface ReviewFinding {
  title: string;
  body: string;
  confidence_score: number;
  priority?: 0 | 1 | 2 | 3 | null;
  code_location: {
    absolute_file_path: string;
    line_range: {
      start: number;
      end: number;
    };
  };
}

export interface ReviewOutput {
  findings: ReviewFinding[];
  overall_correctness: 'patch is correct' | 'patch is incorrect';
  overall_explanation: string;
  overall_confidence_score: number;
}

export function isReviewOutput(value: unknown): value is ReviewOutput {
  if (!value || typeof value !== 'object') return false;
  const output = value as Partial<ReviewOutput>;
  return Array.isArray(output.findings)
    && (output.overall_correctness === 'patch is correct' || output.overall_correctness === 'patch is incorrect')
    && typeof output.overall_explanation === 'string'
    && isScore(output.overall_confidence_score)
    && output.findings.every(isReviewFinding);
}

function isReviewFinding(value: unknown): value is ReviewFinding {
  if (!value || typeof value !== 'object') return false;
  const finding = value as Partial<ReviewFinding>;
  const location = finding.code_location;
  return typeof finding.title === 'string'
    && typeof finding.body === 'string'
    && isScore(finding.confidence_score)
    && (finding.priority === undefined || finding.priority === null || [0, 1, 2, 3].includes(finding.priority))
    && !!location
    && typeof location.absolute_file_path === 'string'
    && !!location.line_range
    && Number.isInteger(location.line_range.start)
    && Number.isInteger(location.line_range.end)
    && location.line_range.start >= 1
    && location.line_range.end >= location.line_range.start;
}

function isScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}
