import { describe, expect, it } from 'vitest';
import { toJson } from '../../src/core/exports/json';
import { serializeReport, toFixturePopulations } from '../../src/core/serialize';
import { assistant } from './helpers';
import { report, source } from './reportHelpers';

describe('P5/4.7 explicit report/JSON boundary', () => {
  it('serializes all BigInt populations exactly and embeds timezone/filter/digest/completeness', async () => {
    const value = await report([source('claude', [assistant('a')])], { tz: 'Asia/Kolkata', since: '2026-10-14', until: '2026-10-14' });
    value.tokens.input = 9_007_199_254_740_993n;
    const json = JSON.parse(toJson(value)) as ReturnType<typeof serializeReport>;
    expect(json.tokens.input).toBe('9007199254740993');
    expect(json.metadata).toMatchObject({ tz: 'Asia/Kolkata', since: '2026-10-14', until: '2026-10-14', priceTableDigest: value.metadata.priceTableDigest });
    expect(json.complete).toBe(value.complete); expect(json.cost.unknownPriceEvents.total).toBe(0); expect(json.unresolved).toEqual({});
  });
  it('strips planted hash/raw/path fields at every aggregate nesting level and metric-table unknown keys', async () => {
    const value = await report([source('claude', [assistant('a', {}, { cwd: '/PRIVATE-ROOT/app' })])]);
    Object.assign(value, { inputHash: 'PLANTED-DIGEST', raw: 'PRIVATE-PROMPT' });
    Object.assign(value.tokens, { inputHash: 'PLANTED-DIGEST' });
    Object.assign(value.metadata, { relativePath: '/PRIVATE-SOURCE' });
    const group = value.groupings.project[0]; if (group) Object.assign(group, { projectKey: '/PRIVATE-ROOT/app', inputHash: 'PLANTED-DIGEST' });
    value.metricTable.set('PLANTED-DIGEST', { kind: 'count', value: 1 });
    const text = toJson(value);
    expect(text).not.toContain('PLANTED-DIGEST'); expect(text).not.toContain('PRIVATE');
    expect(text).toContain('app');
  });
  it('Report itself defaults to basename/ordinal projects, while explicit fullPaths retains full project keys', async () => {
    const input = [source('claude', [assistant('a', {}, { cwd: '/one/app' }), assistant('b', {}, { cwd: '/two/app' })])];
    const normal = await report(input); expect(normal.groupings.project.map(row => row.label)).toEqual(['app', 'app #2']);
    expect(toJson(normal)).not.toContain('/one'); expect(toJson(normal)).not.toContain('/two');
    const full = await report(input, { fullPaths: true }); expect(toJson(full)).toContain('/one/app');
  });
  it('name maps remain safe for prototype-looking keys and fixture projection contains only closed scored populations', async () => {
    const value = await report([source('claude', [assistant('a', {}, { message: { model: '__proto__', content: [
      { type: 'tool_use', id: 'tool', name: 'constructor', input: {} },
    ] } })])]);
    const projected = toFixturePopulations(value);
    expect(projected.cost.unknownPriceEvents.byModel.__proto__).toBe(1); expect(projected.tools.byName.constructor).toBe(1);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(projected).not.toHaveProperty('metricTable'); expect(projected).not.toHaveProperty('groupings'); expect(projected).toHaveProperty('byDay');
  });
});
