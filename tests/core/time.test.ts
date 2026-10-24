import { describe, expect, it } from 'vitest';
import { dayKey, validateFilters, withinFilters } from '../../src/core/time';
import { parseTimestamp } from '../../src/core/timestamp';

describe('4.5/I6 civil-day filters', () => {
  it('preserves astronomical year0000 and0099, and compares offset-normalized expanded years numerically', () => {
    expect(dayKey(parseTimestamp('0000-06-01T00:00:00Z') ?? NaN, 'UTC')).toBe('0000-06-01');
    expect(dayKey(parseTimestamp('0099-06-01T00:00:00Z') ?? NaN, 'UTC')).toBe('0099-06-01');
    const expanded = parseTimestamp('9999-12-31T23:30:00-01:00') ?? NaN;
    expect(dayKey(expanded, 'UTC')).toBe('10000-01-01');
    expect(withinFilters(expanded, validateFilters('UTC', '9999-01-01'))).toBe(true);
    expect(withinFilters(expanded, validateFilters('UTC', undefined, '9999-12-31'))).toBe(false);
  });
  it('validates IANA timezone/calendar/range before any record handling', () => {
    for (const zone of ['', 'Not/A_Zone', '+01:00', '-0500']) expect(() => validateFilters(zone)).toThrow();
    for (const date of ['2026-02-29', '2026-04-31', '2026-1-01', '2026-10-32', '2026-10-14T00:00:00Z'])
      expect(() => validateFilters('UTC', date)).toThrow();
    expect(() => validateFilters('UTC', '2026-10-15', '2026-10-14')).toThrow();
    expect(validateFilters('Asia/Kolkata', '2024-02-29', '2024-02-29')).toEqual({ tz: 'Asia/Kolkata', since: '2024-02-29', until: '2024-02-29' });
  });
  it('uses inclusive civil dates across a fractional-hour timezone boundary', () => {
    const filters = validateFilters('Asia/Kolkata', '2026-10-15', '2026-10-15');
    expect(dayKey(Date.UTC(2026, 9, 14, 18, 29, 59, 999), filters.tz)).toBe('2026-10-14');
    expect(withinFilters(Date.UTC(2026, 9, 14, 18, 30), filters)).toBe(true);
    expect(withinFilters(Date.UTC(2026, 9, 15, 18, 29, 59, 999), filters)).toBe(true);
    expect(withinFilters(Date.UTC(2026, 9, 15, 18, 30), filters)).toBe(false);
  });
  it('spring DST day includes exactly the local day despite being 23 hours', () => {
    const filters = validateFilters('America/New_York', '2026-03-08', '2026-03-08');
    expect(withinFilters(Date.UTC(2026, 2, 8, 4, 59, 59), filters)).toBe(false);
    expect(withinFilters(Date.UTC(2026, 2, 8, 5), filters)).toBe(true);
    expect(withinFilters(Date.UTC(2026, 2, 9, 3, 59, 59), filters)).toBe(true);
    expect(withinFilters(Date.UTC(2026, 2, 9, 4), filters)).toBe(false);
  });
  it('fall DST day includes both occurrences of the repeated local hour', () => {
    const filters = validateFilters('America/New_York', '2026-11-01', '2026-11-01');
    expect(withinFilters(Date.UTC(2026, 10, 1, 5, 30), filters)).toBe(true);
    expect(withinFilters(Date.UTC(2026, 10, 1, 6, 30), filters)).toBe(true);
    expect(withinFilters(Date.UTC(2026, 10, 2, 4, 59, 59), filters)).toBe(true);
    expect(withinFilters(Date.UTC(2026, 10, 2, 5), filters)).toBe(false);
  });
});
