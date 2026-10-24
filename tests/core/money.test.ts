import { describe, expect, it } from 'vitest';
import { formatUsd } from '../../src/core/money';

describe('rule P5: exact display of aggregate pico-USD', () => {
  it('keeps unknown costs separate from an exact zero', () => {
    expect(formatUsd({ kind: 'unknown', reason: 'no_price_row' })).toBe('unknown');
    expect(formatUsd({ kind: 'known', pico: 0n })).toBe('$0.0000');
  });

  it('shows positive sub-threshold values without suggesting zero cost', () => {
    expect(formatUsd(1n)).toBe('< $0.0001');
    expect(formatUsd(49_999_999n)).toBe('< $0.0001');
  });

  it('rounds half-up exactly at both adjacent display boundaries', () => {
    expect(formatUsd(50_000_000n)).toBe('$0.0001');
    expect(formatUsd(149_999_999n)).toBe('$0.0001');
    expect(formatUsd(150_000_000n)).toBe('$0.0002');
    expect(formatUsd(999_950_000_000n)).toBe('$1.0000');
  });

  it('preserves whole dollars beyond safe number precision', () => {
    const dollars = 9_007_199_254_740_993n;
    expect(formatUsd(dollars * 1_000_000_000_000n + 150_000_000n))
      .toBe('$9007199254740993.0002');
  });

  it('rounds only after aggregation', () => {
    // Two individually sub-threshold costs form one visible display unit.
    expect(formatUsd(30_000_000n + 30_000_000n)).toBe('$0.0001');
  });

  it('rejects negative costs instead of formatting an invalid subtotal', () => {
    expect(() => formatUsd(-1n)).toThrow(RangeError);
  });
});
