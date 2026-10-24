import { describe, expect, it } from 'vitest';
import { analyze } from '../../src/core/analyze';
import { toFixturePopulations } from '../../src/core/serialize';
import { SizeBudgetError } from '../../src/core/sizeBudget';
import { assistant, context, meta, platform, sessionA, token } from './helpers';
import { priceTableText, report, source, textSource } from './reportHelpers';

describe('I6 full-stream accounting, then population-specific filters', () => {
  it('uses pre-window cumulative baselines and filters verified deltas by the emitted instant', async () => {
    const prior = token(2, 100, 20), selected = token(3, 130, 24);
    prior.timestamp = '2026-10-13T12:00:00Z'; selected.timestamp = '2026-10-14T00:00:00Z';
    const value = await report([source('codex', [meta(), context(), prior, selected], 'f1', `rollout-t-${sessionA}.jsonl`)],
      { since: '2026-10-14', until: '2026-10-14' });
    expect(value.tokens).toMatchObject({ input: 30n, output: 4n }); expect(value.modelCalls).toBe(1);
    expect(value.complete).toBe(true); expect(value.counters.get('rowsRead')).toBe(4);
  });
  it('out-of-window unresolved groups, snapshots and row/group counters cannot taint filtered completeness', async () => {
    const old = { timestamp: '2026-10-13T12:00:00Z' };
    const value = await report([source('claude', [assistant('conflict', { output_tokens: 1 }, old),
      assistant('conflict', { output_tokens: 2 }, old), assistant('snapshot', {}, { ...old, requestId: undefined, message: { stop_reason: null } }),
      assistant('included', { cache_read_input_tokens: 3 })])], { since: '2026-10-14', until: '2026-10-14' });
    expect(value.complete).toBe(true); expect(value.unresolved.size).toBe(0);
    expect(value.counters.has('request_id_missing')).toBe(false); expect(value.counters.has('claude_duplicate_rows')).toBe(false);
    expect(value.tokens).toMatchObject({ input: 10n, output: 2n, cacheRead: 3n }); expect(value.cost.knownPico).toBe(43n);
    expect(value.counters.get('rowsRecognised')).toBe(4);
  });
  it('import-wide skips remain visible even when the row would have been outside the window', async () => {
    const value = await report([source('claude', [assistant('bad', { input_tokens: -1 }, { timestamp: '2026-10-13T12:00:00Z' }), assistant('good')])],
      { since: '2026-10-14' });
    expect(value.skipped.get('bad_count')).toBe(1); expect(value.complete).toBe(false);
    expect(value.counters.get('rowsRead')).toBe(2); expect(value.counters.get('rowsRecognised')).toBe(1);
  });
  it('retries see failed pre-window predecessors while counted tools/results use selected call timestamps', async () => {
    const call = (id: string, timestamp: string) => assistant(id, {}, { timestamp, message: { content: [
      { type: 'tool_use', id, name: 'tool', input: { b: 2, a: 1 } },
    ] } });
    const result = (id: string, timestamp: string, error: boolean) => ({ type: 'user', uuid: `${id}-result`, timestamp,
      sessionId: 'session-a', message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: error }] } });
    const value = await report([source('claude', [call('before', '2026-10-13T23:59:58Z'), result('before', '2026-10-13T23:59:59Z', true),
      call('inside', '2026-10-14T00:00:00Z'), result('inside', '2026-10-15T00:00:00Z', false)])], { since: '2026-10-14', until: '2026-10-14' });
    expect(value.retries).toBe(1); expect(value.tools.total).toBe(1); expect(value.toolResults).toEqual({ error: 0, ok: 1, unknown: 0 });
  });
  it('preserves unknown-priced and observed token populations independently of cost completeness', async () => {
    const value = await report([source('claude', [assistant('unknown', { cache_read_input_tokens: 2 }, { message: { model: 'unlisted', stop_reason: null } })])]);
    expect(value.tokens.input).toBe(10n); expect(value.tokensByQuality.observed_snapshot.cacheRead).toBe(2n);
    expect(value.cost.unknownPriceTokens.input).toBe(10n); expect(value.cost.complete).toBe(false); expect(value.complete).toBe(false);
    expect(value.cacheHit).toMatchObject({ numerator: 2n, denominator: 12n, display: '16.7%' });
  });
  it('reprices exactly at a UTC change instant even within one civil day', async () => {
    const table = JSON.parse(priceTableText) as { rows: Record<string, unknown>[] };
    table.rows = [{ ...table.rows[0], input: 1 }, { ...table.rows[0], effective_from: '2026-10-15T12:00:00Z', input: 3 }];
    const value = await report([source('claude', [assistant('a', { input_tokens: 1, output_tokens: 0 }, { timestamp: '2026-10-15T11:59:59.999Z' }),
      assistant('b', { input_tokens: 1, output_tokens: 0 }, { timestamp: '2026-10-15T12:00:00Z' })])], { priceTableText: JSON.stringify(table) });
    expect(value.cost.knownPico).toBe(4n); expect(value.groupings.day).toHaveLength(1);
  });
});

describe('intake safety, counters and report boundary', () => {
  it('rejects invalid filters before calling any source read function', async () => {
    let reads = 0;
    const input = source('claude', []); input.read = async function* () { reads += 1; yield new Uint8Array(); };
    await expect(report([input], { tz: 'not/a-zone' })).rejects.toThrow(); expect(reads).toBe(0);
  });
  it('does not open unsupported/compressed files; empty JSONL contributes no row', async () => {
    const ignored = source('claude', [], 'f2', 'notes.txt'), compressed = source('codex', [], 'f3', 'archive.jsonl.zst');
    ignored.read = compressed.read = () => { throw new Error('must not read'); };
    const value = await report([source('claude', []), ignored, compressed]);
    expect(value.skipped.get('files_empty')).toBe(1); expect(value.skipped.get('ignored_non_jsonl')).toBe(1);
    expect(value.skipped.get('compressed_unsupported')).toBe(1); expect(value.counters.get('rowsRead')).toBe(0);
  });
  it('recounts actual bytes and refuses an undeclared hard-limit chunk before parsing it', async () => {
    const input = source('claude', []);
    input.read = async function* () { yield { byteLength: 2_000_000_001 } as Uint8Array; };
    await expect(report([input], { allowLarge: true })).rejects.toBeInstanceOf(SizeBudgetError);
  });
  it('survives read failures with a safe file-unit diagnostic and no raw error text', async () => {
    const input = source('claude', []); input.read = () => { throw new Error('PRIVATE-PATH-AND-CONTENT'); };
    const value = await report([input]);
    expect(value.skipped.get('file_read_error')).toBe(1); expect(value.complete).toBe(false);
    expect(value.skipped.has('files_empty')).toBe(false); expect(value.skipped.has('truncated_line')).toBe(false);
    expect(JSON.stringify(toFixturePopulations(value))).not.toContain('PRIVATE');
  });
  it('computes exact rowsRead/Recognised including an unidentified Codex file without its record-level skips', async () => {
    const value = await report([textSource('codex', '{"type":"summary"}\nnot JSON\n{}\n', 'f1', 'unnamed.jsonl')]);
    expect(value.counters.get('rowsRead')).toBe(3); expect(value.counters.get('rowsRecognised')).toBe(0);
    expect(value.skipped.get('malformed_json')).toBe(1); expect(value.skipped.get('codex_session_unidentified')).toBe(1);
    expect(value.skipped.has('bad_timestamp')).toBe(false);
  });
  it('global tiny metadata cap is visibly incomplete and no recap or raw transient collections reach Report', async () => {
    const value = await report([source('claude', [assistant()])], { metadataCap: 0 });
    expect(value.unresolved.get('metadata_cap_reached')).toBe(1); expect(value.complete).toBe(false);
    expect(value).not.toHaveProperty('recap'); expect(value).not.toHaveProperty('toolFacts'); expect(value).not.toHaveProperty('eventsRaw');
  });
  it('price digest hashes the raw table text once, not the parsed row order or log data', async () => {
    const hashes: string[] = [];
    const value = await analyze([], { tz: 'UTC', priceTableText }, { ...platform, sha256: async text => { hashes.push(text); return 'a'.repeat(64); } });
    expect(hashes).toEqual([priceTableText]); expect(value.metadata.priceTableDigest).toBe('a'.repeat(64));
  });
});
