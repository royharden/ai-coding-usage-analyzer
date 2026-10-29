import { describe, expect, it } from 'vitest';
import { aggregateEvents } from '../../src/core/aggregate';
import { validatePriceTable } from '../../src/core/prices';
import { event } from './helpers';
import { priceTableText } from './reportHelpers';

const prices = () => validatePriceTable(JSON.parse(priceTableText) as unknown);
describe('all five event groupings', () => {
  it('groups day/project/session/model/agent with exact bucket sums and known/unknown quality populations', () => {
    const rows = [event({ input: 10n, output: 2n, cacheRead: 3n, projectKey: '/one/app' }),
      event({ agent: 'codex', sessionId: 'codex-s', model: 'gpt-test-x', input: 4n, output: 1n, projectKey: '/two/app', quality: 'observed_epoch' }),
      event({ sessionId: 'other-s', model: 'unlisted', input: 7n, projectKey: '/one/app', tsMs: Date.UTC(2026, 9, 15) })];
    const value = aggregateEvents(rows, prices(), 'UTC');
    expect(value.tokens).toMatchObject({ input: 21n, output: 3n, cacheRead: 3n });
    expect(value.cost.knownPico).toBe(51n); // 10*2+2*10+3*1 + 4*1+1*4
    expect(value.cost.unknownPriceEvents.total).toBe(1);
    expect(value.tokensByQuality.observed_epoch.input).toBe(4n);
    expect(value.groupings.day).toHaveLength(2); expect(value.groupings.project).toHaveLength(2);
    expect(value.groupings.session).toHaveLength(3); expect(value.groupings.model).toHaveLength(3); expect(value.groupings.agent).toHaveLength(2);
    for (const groups of Object.values(value.groupings)) {
      expect(groups.reduce((sum, row) => sum + row.tokens.input, 0n)).toBe(21n);
      expect(groups.reduce((sum, row) => sum + row.knownPico, 0n)).toBe(51n);
      expect(groups.reduce((sum, row) => sum + row.unknownPriceEvents, 0)).toBe(1);
      expect(groups.reduce((sum, row) => sum + row.events, 0)).toBe(3);
    }
  });
  it('uses deterministic basename collision ordinals in report rows and exposes full paths only on request', () => {
    const rows = [event({ projectKey: 'C:\\private-two\\app', input: 1n }), event({ projectKey: '/private-one/app', input: 2n })];
    const normal = aggregateEvents(rows, prices(), 'UTC');
    expect(normal.groupings.project.map(row => row.label).sort()).toEqual(['app', 'app #2']);
    expect(normal.groupings.project.every(row => !row.key.includes('private') && !row.label.includes('private'))).toBe(true);
    const full = aggregateEvents(rows, prices(), 'UTC', true);
    expect(full.groupings.project.map(row => row.key).sort()).toEqual(rows.map(row => row.projectKey).sort());
  });
  it('keeps unknown-only civil days and all observed events in token totals', () => {
    const value = aggregateEvents([event({ model: 'unknown', cacheRead: 1n, quality: 'observed_snapshot', tsMs: Date.UTC(2026, 9, 14, 18, 31) })], prices(), 'Asia/Kolkata');
    expect(value.groupings.day[0]).toMatchObject({ key: '2026-10-15', knownPico: 0n, unknownPriceEvents: 1, events: 1 });
    expect(value.cost.unknownPriceTokens.cacheRead).toBe(1n);
    expect(value.events.byQuality.observed_snapshot).toBe(1);
  });
});
