import { describe, expect, it } from 'vitest';
import { parseCodexFile, reconcileCodex } from '../../src/core/codex';
import { MetadataBudget } from '../../src/core/limits';
import type { JsonLine } from '../../src/core/lines';
import { at, codes, codexFile, context, meta, sessionA, sessionB, token } from './helpers';

const run = async (records: Record<string, unknown>[]) => reconcileCodex([await codexFile(records)]);
const tier = (second: number, value: unknown) => ({ type: 'event_msg', timestamp: at(second),
  payload: { type: 'thread_settings_applied', thread_settings: { service_tier: value } } });
const tool = (second: number, id: string, output = false) => ({ type: 'response_item', timestamp: at(second),
  payload: { type: output ? 'function_call_output' : 'function_call', call_id: id, name: 'mcp__s__tool',
    arguments: 'PRIVATE-ARGUMENT', output: 'PRIVATE-REPLY' } });

describe('Codex record intake, identity and order', () => {
  it('X1/X1b finds own meta in any order, ignores embedded parent meta, and falls back only to one leaf id', async () => {
    const file = await codexFile([meta(sessionA), meta(sessionB, sessionA), context(), token(2, 10)], sessionB, 'f1', 'unnamed.jsonl');
    expect(file.sessionId).toBe(sessionB);
    const result = reconcileCodex([file]);
    expect(codes(result).get('codex_embedded_parent_meta')).toBe(1);
    expect(result.events).toHaveLength(0);
    expect(codes(result).get('codex_fork_unproven_prefix')).toBe(1);
    const filenameWins = await codexFile([meta(sessionB), meta(sessionA), token(2, 1, 0, {}, { input_tokens: 1 })]);
    expect(filenameWins.sessionId).toBe(sessionA);
  });
  it('X1/I1 unidentified files retain ONLY line-level diagnostics, with remaining parsed lines explicitly subtracted', async () => {
    const lines: JsonLine[] = [
      { kind: 'record', value: { type: 'summary' }, sourceRef: { fileId: 'f1', line: 1 } },
      { kind: 'record', value: token(1, -1), sourceRef: { fileId: 'f1', line: 2 } },
      { kind: 'skip', diagnostic: { category: 'skip', code: 'malformed_json', count: 1 }, sourceRef: { fileId: 'f1', line: 3 } },
    ];
    const file = await parseCodexFile(lines, 'unnamed.jsonl', 'unnamed.jsonl');
    expect(file.unidentifiedLines).toBe(2);
    expect(file.rowsRead).toBe(3);
    expect(codes(file)).toEqual(new Map([['malformed_json', 1], ['codex_session_unidentified', 1]]));
    expect(file.records).toHaveLength(0);
  });
  it('X1/X2 merges split sessions, collapses full record identities, and ignores total_tokens in every comparison', async () => {
    const record = token(3, 20, 5, { cached_input_tokens: 6, reasoning_output_tokens: 1, total_tokens: 25 });
    const duplicate = token(3, 20, 5, { cached_input_tokens: 6, reasoning_output_tokens: 1, total_tokens: 999 });
    const result = reconcileCodex([
      await codexFile([record, context(), meta()]),
      await codexFile([duplicate, token(2, 10, 2, { cached_input_tokens: 4, reasoning_output_tokens: 1 })], sessionA, 'f2'),
    ]);
    expect(result.events.map(event => [event.input, event.cacheRead, event.output])).toEqual([[6n, 4n, 2n], [8n, 2n, 3n]]);
    expect(codes(result).get('duplicate_copy')).toBe(1);
  });
  it('X1c/I1 validates ignored and empty-token rows before their counters and requires total input/output', async () => {
    const result = await run([meta(), { type: 'token_usage_record', timestamp: at(1), usage: { input_tokens: 999 } },
      { type: 'token_usage_record' }, { type: 'event_msg', timestamp: at(2), payload: { type: 'token_count', info: null } },
      { type: 'event_msg', timestamp: at(3), payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 2 } } } }]);
    expect(codes(result).get('ignored_record_kind')).toBe(1);
    expect(codes(result).get('bad_timestamp')).toBe(1);
    expect(codes(result).get('codex_token_count_empty')).toBe(1);
    expect(codes(result).get('bad_count')).toBe(1);
  });
  it('I1 all absent LAST components default to zero; absent required TOTAL components do not', async () => {
    const result = await run([meta(), context(), token(2, 10, 0, {}, {}), token(3, 12)]);
    expect(codes(result).has('bad_count')).toBe(false);
    expect(codes(result).get('codex_inherited_start')).toBe(1);
    expect(result.events).toMatchObject([{ input: 2n, quality: 'observed_epoch' }]);
  });
  it('sanitizes every record and discards response text and arguments before file identity resolution', async () => {
    const file = await codexFile([meta(), context(), tool(2, 'call'), tool(3, 'call', true)]);
    expect(JSON.stringify(file)).not.toContain('PRIVATE');
  });
});

describe('X4-X10 normative cumulative procedure', () => {
  it('X4/X5/X6 computes deltas, keeps reasoning inside output, checks last ONLY on emitting nonrepeat steps', async () => {
    const result = await run([meta(), context(), token(2, 10, 4, { cached_input_tokens: 2, reasoning_output_tokens: 3 }),
      token(3, 10, 4, { cached_input_tokens: 2, reasoning_output_tokens: 3 }, { input_tokens: 999 }),
      token(4, 15, 7, { cached_input_tokens: 3, reasoning_output_tokens: 4 }, { input_tokens: 999 })]);
    expect(result.events.map(event => [event.input, event.cacheRead, event.output])).toEqual([[8n, 2n, 4n], [4n, 1n, 3n]]);
    expect(codes(result).get('codex_repeat_total')).toBe(1);
    expect(codes(result).get('codex_last_delta_mismatch')).toBe(1);
  });
  it('X5/X5b/X10.6 faults have fixed precedence and preserve an exact verified baseline for later intervals', async () => {
    const result = await run([meta(), context(), token(2, 10),
      token(3, 11, 0, { cached_input_tokens: 2 }), // cached delta 2 > input delta 1
      token(4, 12, 0, { cached_input_tokens: 2, cache_write_input_tokens: 1 }),
      token(5, 13, 0, { cached_input_tokens: 2, cache_write_input_tokens: 1, reasoning_output_tokens: 1 }),
      token(6, 14, 2, { cached_input_tokens: 2, cache_write_input_tokens: 1, reasoning_output_tokens: 1 })]);
    expect(codes(result).get('codex_cached_exceeds_input')).toBe(1);
    expect(codes(result).get('codex_cache_write_unmodeled')).toBe(1);
    expect(codes(result).get('codex_reasoning_exceeds_output')).toBe(1);
    expect(result.events).toMatchObject([{ input: 10n, quality: 'verified' }, { input: 1n, output: 2n, quality: 'verified' }]);
    expect(codes(result).has('baseline_reset_assumed')).toBe(false);
  });
  it('X7/X10.4 a valid regression becomes an uncounted observed epoch baseline', async () => {
    const result = await run([meta(), context(), token(2, 10, 2), token(3, 5, 1), token(4, 8, 3)]);
    expect(result.events).toMatchObject([{ input: 10n, quality: 'verified' }, { input: 3n, output: 2n, quality: 'observed_epoch', observedEpoch: 1 }]);
    expect(codes(result).get('codex_total_regressed')).toBe(1);
    expect(codes(result).get('baseline_reset_assumed')).toBe(1);
  });
  it('X7/X10.3 invalid regressed vectors leave pending until a valid uncounted baseline arrives', async () => {
    const result = await run([meta(), context(), token(2, 10, 2), token(3, 5, 1, { cached_input_tokens: 6 }),
      token(4, 6, 1, { cached_input_tokens: 7 }), token(5, 8, 2, { cached_input_tokens: 7 }),
      token(6, 10, 3, { cached_input_tokens: 8 })]);
    expect(result.events).toMatchObject([{ input: 10n }, { input: 1n, cacheRead: 1n, quality: 'observed_epoch' }]);
    expect(codes(result).get('baseline_reset_assumed')).toBe(1);
  });
  it('X8/X10.1 self-proving zero start works without own meta, including a fork whose parent is absent', async () => {
    const self = token(2, 10, 2, {}, { input_tokens: 10, output_tokens: 2 });
    expect((await run([context(), self])).events).toMatchObject([{ input: 10n, quality: 'verified' }]);
    const fork = await run([meta(sessionA, sessionB), context(), self]);
    expect(fork.events).toMatchObject([{ input: 10n, quality: 'verified' }]);
    expect(codes(fork).get('codex_fork_history_unverified')).toBe(1);
  });
  it('X8 otherwise excludes first inherited/missing-meta vectors, then emits only observed deltas', async () => {
    for (const [prefix, reason] of [
      [[], 'codex_session_meta_missing'], [[meta(sessionA, sessionB)], 'codex_fork_unproven_prefix'],
    ] as const) {
      const result = await run([...prefix, context(), token(2, 10), token(3, 12)]);
      expect(codes(result).get(reason)).toBe(1);
      expect(codes(result).get('baseline_reset_assumed')).toBe(1);
      expect(result.events).toMatchObject([{ input: 2n, quality: 'observed_epoch' }]);
    }
  });
  it('X8(c) proves the longest leading token prefix before zero-start logic and drops each prefix record once', async () => {
    const parent = await codexFile([meta(), context(), token(2, 10), token(3, 15)]);
    const child = await codexFile([meta(sessionB, sessionA), meta(sessionA), context(),
      token(4, 10, 0, {}, { input_tokens: 10 }), token(5, 15), token(6, 18)], sessionB, 'f2');
    const result = reconcileCodex([child, parent]);
    expect(codes(result).get('codex_replay_dropped')).toBe(2);
    expect(result.events.filter(event => event.sessionId === sessionB)).toMatchObject([{ input: 3n, quality: 'verified' }]);
  });
  it('X2/X10.2 incomparable same-time totals form ONE unresolved set, including the first step', async () => {
    const result = await run([meta(), context(), token(2, 10, 2), token(2, 9, 3), token(3, 12, 4), token(4, 14, 5)]);
    expect(codes(result).get('codex_ambiguous_order')).toBe(1);
    expect(codes(result).get('baseline_reset_assumed')).toBe(1);
    expect(result.events).toMatchObject([{ input: 2n, output: 1n, quality: 'observed_epoch' }]);
  });
  it('X10.2 a tied fork prefix cannot resume replay after forcing a pending baseline', async () => {
    const parent = await codexFile([meta(), context(), token(2, 10, 2), token(2, 9, 3), token(3, 12, 4), token(4, 14, 5)]);
    const child = await codexFile([meta(sessionB, sessionA), context(), token(5, 10, 2), token(5, 9, 3),
      token(6, 12, 4), token(7, 14, 5)], sessionB, 'f2');
    const result = reconcileCodex([parent, child]);
    expect(codes(result).get('codex_replay_dropped')).toBeUndefined();
    expect(result.events.filter(event => event.sessionId === sessionB)).toMatchObject([
      { input: 2n, output: 1n, quality: 'observed_epoch' },
    ]);
  });
  it('X2 ties sort equal totals by absent last, last components, then turn id', async () => {
    const result = await run([meta(), context(), token(2, 10, 2, {}, { input_tokens: 2 }), token(2, 10, 2)]);
    expect(result.events).toHaveLength(1);
    expect(codes(result).get('codex_repeat_total')).toBe(1);
    expect(codes(result).has('codex_inherited_start')).toBe(false);
  });
  it('X3/X10.7 tied contexts remain ambiguous until a single later context, with exact-switch steps quarantined', async () => {
    const result = await run([meta(), context(1, { model: 'a' }), context(1, { model: 'b' }), token(2, 10),
      context(3, { model: 'a' }), token(3, 12), token(4, 15)]);
    expect(codes(result).get('codex_ambiguous_context')).toBe(1);
    expect(codes(result).get('codex_ambiguous_order')).toBe(1);
    expect(result.events).toMatchObject([{ input: 3n, model: 'a', quality: 'verified' }]);
  });
  it('X10.5 repeats outrank a same-time context switch and do not inspect last', async () => {
    const result = await run([meta(), context(), token(2, 10), context(3, { model: 'other' }), token(3, 10), token(4, 12)]);
    expect(codes(result).get('codex_repeat_total')).toBe(1);
    expect(codes(result).has('codex_ambiguous_order')).toBe(false);
    expect(result.events[1]?.model).toBe('other');
  });
  it('X3 no context leaves model unknown while own meta cwd remains available', async () => {
    const result = await run([meta(), token(2, 10)]);
    expect(result.events).toMatchObject([{ model: 'unknown', projectKey: '/synthetic/codex' }]);
  });
  it('P4 tier ambiguity persists until a single setting, and non-string tiers retain an unconditional invalid flag', async () => {
    const result = await run([meta(), context(), tier(1, 'default'), tier(1, 'priority'), token(2, 1),
      tier(3, 123), token(4, 2), tier(5, 'default'), token(6, 3)]);
    expect(result.events.map(event => event.modifiers)).toMatchObject([
      { tierAmbiguous: true }, { invalidModifier: true }, { serviceTier: 'default', invalidModifier: false },
    ]);
  });
});

describe('I5/X1d/X9 fork tools and turns', () => {
  it('suppresses parent call, output and turn replays, while replay contexts still attribute new child usage', async () => {
    const parent = await codexFile([meta(), context(), tool(2, 'parent'), tool(3, 'parent', true), token(4, 2)]);
    const child = await codexFile([meta(sessionB, sessionA), meta(), context(5), tool(6, 'parent'), tool(7, 'parent', true),
      context(8, { turn_id: 'child-turn' }), tool(9, 'child'), token(10, 3, 0, {}, { input_tokens: 3 })], sessionB, 'f2');
    const result = reconcileCodex([parent, child]);
    expect(codes(result).get('codex_replay_tool_dropped')).toBe(2);
    expect(codes(result).get('codex_replay_turn_dropped')).toBe(1);
    expect(result.tools).toHaveLength(2);
    expect(result.turns).toHaveLength(2);
    expect(result.tools.every(fact => fact.status === 'unknown' && fact.inputHash === undefined)).toBe(true);
  });
  it('parent absent counts child history, turn ids once, anonymous turns by identity, tool outputs are not calls', async () => {
    const result = await run([meta(sessionA, sessionB), context(1), context(2), context(3, { turn_id: undefined }),
      tool(4, 'call'), tool(5, 'call', true)]);
    expect(result.turns).toHaveLength(2);
    expect(result.tools).toHaveLength(1);
    expect(codes(result).get('codex_fork_history_unverified')).toBe(1);
  });
  it('4.7 many malformed lines are constant-space exact counters and tiny retained-stream caps are visibly partial', async () => {
    async function* lines(): AsyncGenerator<JsonLine> {
      for (let index = 0; index < 1000; index += 1) yield { kind: 'skip',
        diagnostic: { category: 'skip', code: 'malformed_json', count: 1 }, sourceRef: { fileId: 'f1', line: index + 1 } };
    }
    const file = await parseCodexFile(lines(), `rollout-t-${sessionA}.jsonl`, 'x');
    expect(file.diagnostics).toHaveLength(1);
    expect(codes(file).get('malformed_json')).toBe(1000);
    const budget = new MetadataBudget(0);
    const limited = await parseCodexFile([{ kind: 'record', value: meta(), sourceRef: { fileId: 'f1', line: 1 } }], `rollout-t-${sessionA}.jsonl`, 'x', budget);
    expect(codes(limited).get('metadata_cap_reached')).toBe(1);
    expect(limited.records).toHaveLength(0);
  });
});
