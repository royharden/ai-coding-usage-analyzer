export type SizeBudgetDecision = {
  kind: 'allowed' | 'confirmation_required' | 'refused'; bytes: number;
  reason?: 'invalid_size' | 'over_warning_limit' | 'over_hard_limit';
};
export const WARNING_BYTES = 500_000_000;
export const HARD_LIMIT_BYTES = 2_000_000_000;
// rule 4.7: decimal byte thresholds; re-used before intake and on each streamed chunk.
export function checkSizeBudget(bytes: number, allowLarge: boolean): SizeBudgetDecision {
  if (!Number.isSafeInteger(bytes) || bytes < 0) return { kind: 'refused', bytes, reason: 'invalid_size' };
  if (bytes > HARD_LIMIT_BYTES) return { kind: 'refused', bytes, reason: 'over_hard_limit' };
  if (bytes > WARNING_BYTES && !allowLarge) return { kind: 'confirmation_required', bytes, reason: 'over_warning_limit' };
  return { kind: 'allowed', bytes };
}
export class SizeBudgetError extends Error {
  readonly decision: SizeBudgetDecision;
  constructor(decision: SizeBudgetDecision) {
    super(decision.kind === 'confirmation_required' ? 'Large import needs deliberate confirmation' : 'Import size refused');
    this.name = 'SizeBudgetError'; this.decision = decision;
  }
}
