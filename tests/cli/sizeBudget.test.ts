import { describe, expect, it } from 'vitest';
import { checkSizeBudget } from '../../src/core/sizeBudget';

describe('Plan 4.7 decimal byte budget', () => {
  it.each([0, 1, 499_999_999, 500_000_000])('allows %d bytes without confirmation', bytes => {
    expect(checkSizeBudget(bytes, false)).toEqual({ kind: 'allowed', bytes });
  });
  it.each([500_000_001, 1_999_999_999, 2_000_000_000])('requires deliberate confirmation for %d bytes', bytes => {
    expect(checkSizeBudget(bytes, false)).toMatchObject({ kind: 'confirmation_required', bytes });
    expect(checkSizeBudget(bytes, true)).toEqual({ kind: 'allowed', bytes });
  });
  it.each([2_000_000_001, Number.MAX_SAFE_INTEGER])('refuses %d bytes even with confirmation', bytes => {
    expect(checkSizeBudget(bytes, false).kind).toBe('refused'); expect(checkSizeBudget(bytes, true).kind).toBe('refused');
  });
  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('refuses invalid byte counts %s', bytes => {
    expect(checkSizeBudget(bytes, true)).toMatchObject({ kind: 'refused', reason: 'invalid_size' });
  });
});
