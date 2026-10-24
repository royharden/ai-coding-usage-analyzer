import { describe, expect, it } from 'vitest';
import { priceEvent, selectPrice, validatePriceTable } from '../../src/core/prices';
import { modifiers } from '../../src/core/validation';
import { event } from './helpers';

const day = (date: number) => Date.UTC(2026, 9, date, 10);
const row = (extra: Record<string, unknown> = {}) => ({
  model: 'claude-test-a', effective_from: '2026-10-01T00:00:00Z',
  input: 1, output: 2, cache_write_5m: 3, cache_write_1h: 4, cache_read: 5,
  source_url: 'https://example.invalid/synthetic-prices', retrieved: '2026-10-24', ...extra,
});
const table = (rows: unknown[]) => validatePriceTable({
  schema: 'pricetable/1', currency: 'USD', unit: 'micro_usd_per_mtok', rows,
});
const usage = (extra: Parameters<typeof event>[0] = {}) => event({ tsMs: day(14), ...extra });

describe('rules P1/P3: validate complete price-table input', () => {
  it('accepts an empty production table without manufacturing prices', () => {
    expect(table([]).rows).toEqual([]);
    expect(priceEvent(usage({ input: 1n }), table([])))
      .toEqual({ kind: 'unknown', reason: 'no_price_row' });
  });

  it('rejects malformed headers, rows and required provenance', () => {
    expect(() => validatePriceTable({ schema: 'wrong', rows: [] })).toThrow();
    for (const invalid of [null, row({ source_url: undefined }), row({ retrieved: '2026-02-30' }),
      row({ effective_from: '2026-10-01T00:00:00+00:00' }), row({ model: '' }),
      row({ supported_speeds: [5] })]) {
      expect(() => table([invalid])).toThrow();
    }
  });

  it('rejects negative, fractional and unsafe rates', () => {
    for (const input of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => table([row({ input })])).toThrow();
    }
  });

  it('rejects duplicate effective instants even with different fractional spelling', () => {
    expect(() => table([row(), row({ effective_from: '2026-10-01T00:00:00.000Z' })])).toThrow();
  });
});

describe('rule P2: exact model and latest effective instant', () => {
  it('selects a new row exactly at its boundary, independent of row ordering', () => {
    const prices = table([row({ effective_from: '2026-10-15T10:00:00Z', input: 7 }), row()]);
    expect(selectPrice(prices, 'claude-test-a', day(15) - 1)?.input).toBe(1n);
    expect(selectPrice(prices, 'claude-test-a', day(15))?.input).toBe(7n);
    expect(priceEvent(usage({ tsMs: day(15), input: 3n }), prices)).toEqual({ kind: 'known', pico: 21n });
  });

  it('never substitutes a family alias or a future price', () => {
    const prices = table([row()]);
    expect(selectPrice(prices, 'claude-test-a-latest', day(14))).toBeUndefined();
    expect(priceEvent(usage({ tsMs: Date.UTC(2026, 8, 30), input: 1n }), prices))
      .toEqual({ kind: 'unknown', reason: 'no_price_row' });
  });
});

describe('rules P4/P5 and I6: cost status and exact nonoverlapping buckets', () => {
  it('multiplies all five buckets in pico-USD without adding cache to uncached input', () => {
    expect(priceEvent(usage({ input: 2n, output: 3n, cacheWrite5m: 5n, cacheWrite1h: 7n, cacheRead: 11n }), table([row()])))
      .toEqual({ kind: 'known', pico: 106n });
  });

  it('requires a bucket rate only when that bucket has a nonzero population', () => {
    const prices = table([row({ cache_write_1h: undefined })]);
    expect(priceEvent(usage({ input: 1n }), prices)).toEqual({ kind: 'known', pico: 1n });
    expect(priceEvent(usage({ input: 1n, cacheWrite1h: 1n }), prices))
      .toEqual({ kind: 'unknown', reason: 'rate_missing' });
  });

  it('checks the whole prompt threshold, including cached input', () => {
    const prices = table([row({ max_input_tokens_per_call: 100 })]);
    expect(priceEvent(usage({ input: 1n, cacheRead: 99n }), prices)).toEqual({ kind: 'known', pico: 496n });
    expect(priceEvent(usage({ input: 1n, cacheRead: 100n }), prices))
      .toEqual({ kind: 'unknown', reason: 'tier_unsupported' });
  });

  it('treats only absent, null and empty observed modifiers as unspecified', () => {
    const prices = table([row()]);
    for (const value of [undefined, null, '']) {
      expect(priceEvent(usage({ input: 1n, modifiers: modifiers({ service_tier: value }) }), prices))
        .toEqual({ kind: 'known', pico: 1n });
    }
    for (const value of [5, false, {}, 'premium']) {
      expect(priceEvent(usage({ input: 1n, modifiers: modifiers({ service_tier: value }) }), prices))
        .toEqual({ kind: 'unknown', reason: 'tier_unsupported' });
    }
  });

  it('cannot price an invalid modifier through a supported-list marker collision', () => {
    const prices = table([row({ supported_service_tiers: ['\u0000unsupported-modifier'] })]);
    expect(priceEvent(usage({ input: 1n, modifiers: modifiers({ service_tier: 5 }) }), prices))
      .toEqual({ kind: 'unknown', reason: 'tier_unsupported' });
  });

  it('keeps unknown reason precedence stable when several faults coexist', () => {
    const input = usage({ model: 'unlisted', cacheWrite1h: 1n, modifiers: { speed: 'fast' } });
    const prices = table([row({ cache_write_1h: undefined, max_input_tokens_per_call: 0 })]);
    expect(priceEvent(input, prices)).toEqual({ kind: 'unknown', reason: 'no_price_row' });
    expect(priceEvent({ ...input, model: 'claude-test-a' }, prices))
      .toEqual({ kind: 'unknown', reason: 'tier_unsupported' });
    expect(priceEvent({ ...input, model: 'claude-test-a', modifiers: {} }, prices))
      .toEqual({ kind: 'unknown', reason: 'tier_unsupported' });
  });
});
