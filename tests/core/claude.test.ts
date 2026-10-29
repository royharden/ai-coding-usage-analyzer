import { describe, expect, it } from 'vitest';
import { parseClaudeRecord } from '../../src/core/claude';
import { parseTimestamp } from '../../src/core/timestamp';
import { assistant, claude, codes, platform } from './helpers';

describe('Claude row validation and bucket metadata', () => {
  it.each([null, [], 'usage', 1])('I1 rejects present malformed usage %s instead of silently ignoring it', async usage => {
    const raw = assistant();
    (raw.message as Record<string, unknown>).usage = usage;
    expect(codes(await claude([raw])).get('bad_count')).toBe(1);
  });
  it('C1 keeps five distinct BigInt buckets without adding write total twice', async () => {
    const result = await claude([assistant('a', { cache_read_input_tokens: 3, cache_creation_input_tokens: 12,
      cache_creation: { ephemeral_5m_input_tokens: 5, ephemeral_1h_input_tokens: 7 } })]);
    expect(result.events[0]).toMatchObject({ input: 10n, output: 2n, cacheRead: 3n, cacheWrite5m: 5n, cacheWrite1h: 7n, assumed5m: false });
  });
  it('C1/I2 assumes 5m only for positive unsplit writes, with optional counts defaulting to zero', async () => {
    const result = await claude([assistant('a'), assistant('b', { cache_creation_input_tokens: 4 })]);
    expect(result.events.map(event => event.assumed5m)).toEqual([false, true]);
    expect(codes(result).get('assumed5m')).toBe(1);
    expect(result.events[1]?.cacheWrite5m).toBe(4n);
  });
  it.each([undefined, null, -1, 1.5, 9_007_199_254_740_992, '5'])('N1 rejects required count %s before timestamp errors', async value => {
    const result = await claude([assistant('a', { input_tokens: value }, { timestamp: 'bad' })]);
    expect(codes(result)).toEqual(new Map([['bad_count', 1]]));
    expect(result.events).toHaveLength(0);
  });
  it('I1 validates timestamps on ignored records; absent kind does not bypass validation', async () => {
    const result = await claude([{ type: 'summary' }, { type: 'summary', timestamp: '2026-10-14T00:00:00Z' }]);
    expect(codes(result)).toEqual(new Map([['bad_timestamp', 1], ['ignored_record_kind', 1]]));
  });
  it.each(['2026-02-29T00:00:00Z', '2026-04-31T00:00:00Z', '2026-10-14t10:00:00Z', '2026-10-14T10:00:00z',
    '2026-10-14T10:00:60Z', '2026-10-14T10:00:00-00:00', '2026-10-14', '2026-10-14T24:00:00Z'])('I1 rejects %s', value => {
    expect(parseTimestamp(value)).toBeUndefined();
  });
  it('I1 supports calendar leap years, UTC offsets, years below 100, and truncates fractional milliseconds', () => {
    expect(parseTimestamp('2024-02-29T00:00:00.123999Z')).toBe(parseTimestamp('2024-02-29T05:30:00.123+05:30'));
    expect(parseTimestamp('0099-01-01T00:00:00Z')).toBeLessThan(0);
    expect(parseTimestamp('1900-02-29T00:00:00Z')).toBeUndefined();
    expect(parseTimestamp('2000-02-29T00:00:00Z')).toBeDefined();
  });
  it('N1 caps identity by code points, never truncates into a collision', async () => {
    expect((await claude([assistant('😀'.repeat(4097))])).events).toHaveLength(0);
    expect(codes(await claude([assistant('😀'.repeat(4097))])).get('field_too_long')).toBe(1);
    expect((await claude([assistant('😀'.repeat(4096))])).events).toHaveLength(1);
  });
  it('C5 skips synthetic and zero API errors, preserves a nonzero API error, dedupes row counters by uuid', async () => {
    const synthetic = assistant('s', { input_tokens: 1 }, { message: { model: '<synthetic>' } });
    const result = await claude([synthetic, synthetic, assistant('e', { input_tokens: 0, output_tokens: 0 }, { isApiErrorMessage: true }),
      assistant('normal', {}, { isApiErrorMessage: true })]);
    expect(result.events).toHaveLength(1);
    expect(codes(result).get('synthetic_or_error_row')).toBe(2);
    expect(codes(result).get('synthetic_nonzero_usage')).toBe(1);
  });
  it('C5 precedes C1 but uses RAW write total for zero detection, even when a split is zero', async () => {
    const usage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 5,
      cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 } };
    const result = await claude([assistant('error', usage, { isApiErrorMessage: true }),
      assistant('synthetic', usage, { message: { model: '<synthetic>' } })]);
    expect(codes(result).get('cache_split_mismatch')).toBe(1);
    expect(codes(result).get('synthetic_nonzero_usage')).toBe(1);
    expect(codes(result).get('synthetic_or_error_row')).toBe(1);
  });
  it('safe parsed metadata retains no prompt/reply/tool arguments; only the injected canonical digest survives transiently', async () => {
    const record = assistant('a', {}, { message: { content: [{ type: 'text', text: 'PRIVATE-PROMPT' },
      { type: 'tool_use', id: 'call', name: 'x', input: { b: 'PRIVATE-ARGUMENT', a: 1 } }] } });
    const parsed = await parseClaudeRecord(record, { relativePath: 'a', sourceRef: { fileId: 'f1', line: 1 } }, platform);
    const retained = JSON.stringify(parsed, (_, value: unknown) => typeof value === 'bigint' ? value.toString() : value);
    expect(retained).not.toContain('PRIVATE');
    expect(parsed.row?.tools[0]?.inputHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
