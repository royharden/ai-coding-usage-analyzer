import { describe, expect, it } from 'vitest';
import { checkedRecap, recapSegments, render } from '../../src/core/recap';
import { numericLiterals, recapCheck, RECAP_FAILURE_REASON } from '../../src/core/recapCheck';
import { serializeReport, toFixturePopulations } from '../../src/core/serialize';
import type { MetricValue } from '../../src/core/types';
import { report } from './reportHelpers';

const table = new Map<string, MetricValue>([
  ['events.total', { kind: 'count', value: 123 }], ['tokens.input', { kind: 'tokens', value: 456789n }],
  ['tokens.output', { kind: 'tokens', value: 42n }], ['cost.known', { kind: 'money', value: 123_456_780_000_000n }],
  ['cost.unknownEvents', { kind: 'count', value: 7 }], ['cacheHit', { kind: 'ratio', numerator: 1n, denominator: 3n }],
  ['unresolved.total', { kind: 'count', value: 8 }],
]);

describe('4.6 independently checked deterministic recap', () => {
  it('uses digit-free text fragments and exact metric-owned numeric boundaries', () => {
    for (const segment of recapSegments) if (segment.kind === 'text') expect(segment.text).not.toMatch(/[0-9]/);
    const recap = render(recapSegments, table);
    expect(recapCheck(recap.text, recap.spans, table)).toEqual({ ok: true });
    expect(numericLiterals(recap.text)).toEqual(recap.spans.map(({ start, end }) => ({ start, end })));
    expect(recap.text).toContain('$123.4568'); expect(recap.text).toContain('33.3%');
  });
  it('rejects a changed digit at every rendered digit position, including decimal money and percent', () => {
    const recap = render(recapSegments, table);
    for (let index = 0; index < recap.text.length; index += 1) {
      const digit = recap.text[index];
      if (!digit || !/[0-9]/.test(digit)) continue;
      const text = recap.text.slice(0, index) + (digit === '9' ? '0' : '9') + recap.text.slice(index + 1);
      expect(recapCheck(text, recap.spans, table).ok, `digit position ${index}`).toBe(false);
    }
  });
  it('rejects extra numbers, substituted words, swapped equal-length values and wrong or absent ids', () => {
    const recap = render([{ kind: 'metric', metricId: 'events.total' }, { kind: 'text', text: ' versus ' },
      { kind: 'metric', metricId: 'tokens.output' }], new Map(table).set('tokens.output', { kind: 'tokens', value: 987n }));
    const values = new Map(table).set('tokens.output', { kind: 'tokens', value: 987n });
    expect(recapCheck(recap.text + ' 55', recap.spans, values).ok).toBe(false);
    expect(recapCheck('987 versus 123', recap.spans, values).ok).toBe(false);
    expect(recapCheck('one versus 987', recap.spans, values).ok).toBe(false);
    const first = recap.spans[0]; if (!first) throw new Error('Missing test span');
    expect(recapCheck(recap.text, [{ ...first, metricId: 'tokens.output' }, ...recap.spans.slice(1)], values).ok).toBe(false);
    expect(recapCheck(recap.text, [{ ...first, metricId: 'unknown.metric' }, ...recap.spans.slice(1)], values).ok).toBe(false);
    expect(recapCheck(recap.text, recap.spans, new Map()).ok).toBe(false);
  });
  it('rejects empty, overlapping, out-of-range, partial and noninteger spans', () => {
    const recap = render([{ kind: 'metric', metricId: 'events.total' }], table);
    for (const spans of [[], [{ start: 0, end: 0, metricId: 'events.total' }],
      [...recap.spans, ...recap.spans], [{ start: -1, end: 3, metricId: 'events.total' }],
      [{ start: 0, end: 4, metricId: 'events.total' }], [{ start: 0, end: 2, metricId: 'events.total' }],
      [{ start: 0.5, end: 3, metricId: 'events.total' }]]) expect(recapCheck(recap.text, spans, table).ok).toBe(false);
    expect(recapCheck('', [], table).ok).toBe(false);
  });
  it('treats tiny money as one exact literal and rejects every digit mutation in it', () => {
    const values = new Map(table).set('cost.known', { kind: 'money', value: 1n });
    const recap = render([{ kind: 'metric', metricId: 'cost.known' }], values);
    expect(recap.text).toBe('< $0.0001'); expect(numericLiterals(recap.text)).toEqual([{ start: 0, end: 9 }]);
    expect(recapCheck(recap.text, recap.spans, values).ok).toBe(true);
    for (let index = 0; index < recap.text.length; index += 1) if (/[0-9]/.test(recap.text[index] ?? '')) {
      const changed = recap.text.slice(0, index) + '9' + recap.text.slice(index + 1);
      expect(recapCheck(changed, recap.spans, values).ok).toBe(false);
    }
    expect(recapCheck('$0.0001', [{ start: 0, end: 7, metricId: 'cost.known' }], values).ok).toBe(false);
  });
  it('accepts zero-denominator n/a and unavailable values without inventing numbers', () => {
    const values = new Map<string, MetricValue>([['cacheHit', { kind: 'ratio', numerator: 0n, denominator: 0n }],
      ['codex.errorRate', { kind: 'unavailable', value: 'not available' }]]);
    const recap = render([{ kind: 'metric', metricId: 'cacheHit' }, { kind: 'text', text: '; ' },
      { kind: 'metric', metricId: 'codex.errorRate' }], values);
    expect(recapCheck(recap.text, recap.spans, values).ok).toBe(true);
    expect(recapCheck(recap.text.replace('n/a', '0.0'), recap.spans, values).ok).toBe(false);
  });
  it('refuses digits in a prose segment and suppresses render/check failure with a fixed reason', () => {
    expect(() => render([{ kind: 'text', text: 'Model 9' }], table)).toThrow(RECAP_FAILURE_REASON);
    expect(checkedRecap(new Map())).toEqual({ recapStatus: { ok: false, reason: RECAP_FAILURE_REASON } });
  });
  it('integrates into analyze, rechecks at serialization and preserves the fixture-scored roots', async () => {
    const value = await report();
    expect(value.recapStatus).toEqual({ ok: true }); expect(serializeReport(value).recap).toEqual(value.recap);
    const scored = toFixturePopulations(value);
    expect(scored).not.toHaveProperty('recap'); expect(scored).not.toHaveProperty('recapStatus');
    if (!value.recap) throw new Error('Missing recap');
    value.recap.text += ' injected 99';
    const safe = serializeReport(value);
    expect(safe).not.toHaveProperty('recap'); expect(safe.recapStatus).toEqual({ ok: false, reason: RECAP_FAILURE_REASON });
    expect(toFixturePopulations(value)).toEqual(scored);
  });
  it('suppresses nonnumeric prose substitutions at serialization, even when numeric checks still pass', async () => {
    const value = await report();
    if (!value.recap) throw new Error('Missing recap');
    value.recap.text = value.recap.text.replace('Counted', 'Altered');
    expect(recapCheck(value.recap.text, value.recap.spans, value.metricTable).ok).toBe(true);
    expect(serializeReport(value)).not.toHaveProperty('recap');
    expect(serializeReport(value).recapStatus).toEqual({ ok: false, reason: RECAP_FAILURE_REASON });
  });
  it('derives serialized metrics from current aggregate fields and suppresses an old table/recap pair', async () => {
    const value = await report();
    if (!value.recap) throw new Error('Missing recap');
    const oldRecap = value.recap;
    const oldMetric = value.metricTable.get('tokens.input');
    value.tokens.input = 9007199254740993n;
    // The candidate still passes against its stale retained table; that is insufficient at the output boundary.
    expect(recapCheck(oldRecap.text, oldRecap.spans, value.metricTable).ok).toBe(true);
    const safe = serializeReport(value);
    expect(safe.tokens.input).toBe('9007199254740993');
    expect(safe.metricTable['tokens.input']).toEqual({ kind: 'tokens', value: '9007199254740993' });
    expect(safe).not.toHaveProperty('recap');
    expect(safe.recapStatus).toEqual({ ok: false, reason: RECAP_FAILURE_REASON });
    expect(value.metricTable.get('tokens.input')).toBe(oldMetric);
    expect(value.recap).toBe(oldRecap);
  });
});
