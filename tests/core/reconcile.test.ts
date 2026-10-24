import { describe, expect, it } from 'vitest';
import { parseClaudeRecord } from '../../src/core/claude';
import { DiagnosticBag } from '../../src/core/diagnostics';
import { MetadataBudget } from '../../src/core/limits';
import { reconcileClaude } from '../../src/core/reconcile';
import { canonicalInput } from '../../src/core/platform';
import { assistant, claude, codes, instant, platform } from './helpers';

describe('Claude identities and resolution', () => {
  it('C2/C3 dedupes identical rows and selects the unique terminal vector over any snapshot order', async () => {
    const snapshot = assistant('a', { output_tokens: 1 }, { message: { stop_reason: null } });
    const terminal = assistant('a', { output_tokens: 9 });
    for (const rows of [[snapshot, terminal, terminal], [terminal, terminal, snapshot]]) {
      const result = await claude(rows);
      expect(result.events).toHaveLength(1);
      expect(result.events[0]).toMatchObject({ output: 9n, quality: 'verified' });
      expect(codes(result).get('claude_duplicate_rows')).toBe(2);
    }
  });
  it('C3 observed snapshots count but unresolved competing terminal vectors emit no event', async () => {
    const result = await claude([assistant('snapshot', {}, { message: { stop_reason: null } }),
      assistant('conflict', { output_tokens: 1 }), assistant('conflict', { output_tokens: 2 })]);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.quality).toBe('observed_snapshot');
    expect(codes(result).get('claude_nonterminal_snapshot')).toBe(1);
    expect(codes(result).get('claude_conflicting_duplicates')).toBe(1);
  });
  it('I2 model conflict outranks split mismatch which outranks snapshot conflict; duplicates count unresolved groups', async () => {
    const badSplit = { cache_creation_input_tokens: 3, cache_creation: { ephemeral_5m_input_tokens: 1 } };
    const result = await claude([assistant('model', badSplit), assistant('model', {}, { message: { model: 'other' } }),
      assistant('split', badSplit), assistant('split', { output_tokens: 9 })]);
    expect(result.events).toHaveLength(0);
    expect(codes(result).get('claude_model_conflict')).toBe(1);
    expect(codes(result).get('cache_split_mismatch')).toBe(1);
    expect(codes(result).get('claude_conflicting_duplicates')).toBeUndefined();
    expect(codes(result).get('claude_duplicate_rows')).toBe(2);
  });
  it('C3b/I3 attributes an identical cross-file copy to one total-order candidate and C4 flags only that candidate', async () => {
    const a = assistant('same', {}, { sessionId: 'b', cwd: '/z', isSidechain: true, agentId: 'sub' });
    const b = assistant('same', {}, { sessionId: 'a', cwd: '/a', isSidechain: false });
    for (const rows of [[a, b], [b, a]]) {
      const result = await claude(rows);
      expect(result.events[0]).toMatchObject({ sessionId: 'a', projectKey: '/a', sidechain: false });
      expect(codes(result).get('claude_attribution_conflict')).toBe(1);
      expect(result.events[0]?.quality).toBe('verified');
    }
  });
  it('C3b uses ONLY chosen-vector terminal candidates when streaming vectors differ', async () => {
    const result = await claude([assistant('a', { output_tokens: 1 }, { timestamp: '2026-10-14T09:00:00Z', sessionId: 'old', message: { stop_reason: null } }),
      assistant('a', { output_tokens: 8 }, { sessionId: 'final' })]);
    expect(result.events[0]).toMatchObject({ output: 8n, sessionId: 'final', tsMs: Date.parse(instant) });
    expect(codes(result).has('claude_attribution_conflict')).toBe(false);
    expect(result.diagnostics.find(item => item.code === 'claude_duplicate_rows')?.tsMs).toBe(Date.parse('2026-10-14T09:00:00Z'));
  });
  it('C2 null requests match any logged snapshot; unlogged or ambiguous snapshots are unresolved row outcomes', async () => {
    const result = await claude([
      assistant('a', { output_tokens: 1 }, { message: { stop_reason: null } }), assistant('a', { output_tokens: 9 }),
      assistant('a', { output_tokens: 1 }, { requestId: undefined, uuid: 'null-snapshot', message: { stop_reason: null } }),
      assistant('a', { output_tokens: 4 }, { requestId: undefined, uuid: 'unlogged' }),
      assistant('b'), assistant('b', {}, { requestId: 'other' }), assistant('b', {}, { requestId: undefined, uuid: 'ambiguous' }),
    ]);
    expect(result.events).toHaveLength(3);
    expect(codes(result).get('request_id_missing')).toBe(3);
    expect(codes(result).get('request_id_missing_merged')).toBe(1);
    expect(codes(result).get('request_id_conflict')).toBe(2);
  });
  it('C1/C2/I2 raw split-mismatch null rows match raw fields and poison one group; assumed5m is part of equality', async () => {
    const mismatch = { cache_creation_input_tokens: 5, cache_creation: { ephemeral_5m_input_tokens: 2 } };
    const result = await claude([assistant('raw', mismatch), assistant('raw', mismatch, { requestId: undefined, uuid: 'null' }),
      assistant('assumed', { cache_creation_input_tokens: 2 }),
      assistant('assumed', { cache_creation_input_tokens: 2, cache_creation: { ephemeral_5m_input_tokens: 2 } }, { requestId: undefined, uuid: 'not-equal' })]);
    expect(codes(result).get('request_id_missing_merged')).toBe(1);
    expect(codes(result).get('cache_split_mismatch')).toBe(1);
    expect(codes(result).get('request_id_conflict')).toBe(1);
    expect(result.events).toHaveLength(1);
  });
  it('C2 no identity is unresolved by distinct row uuid; tools in that row still count', async () => {
    const raw = assistant('x', {}, { message: { id: undefined, content: [{ type: 'tool_use', id: 'call', name: 'tool', input: {} }] } });
    const result = await claude([raw, raw]);
    expect(result.events).toHaveLength(0);
    expect(codes(result).get('no_identity')).toBe(1);
    expect(result.tools).toHaveLength(1);
  });
});

describe('C6/C7/I4 tools and turns', () => {
  const call = (id: string, name = 'mcp__server__tool') => assistant(id, {}, { message: { content: [{ type: 'tool_use', id: 'call', name, input: { z: 1, a: [true] } }] } });
  const result = (uuid: string, id: string, flag?: boolean) => ({ type: 'user', uuid, timestamp: instant,
    sessionId: 'session-a', message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: flag }] } });
  it('C6/I4 joins results, ignores absent flags, and excludes Codex entirely from Claude statuses', async () => {
    const output = await claude([call('a'), call('a'), result('r1', 'call'), result('r2', 'call', true)]);
    expect(output.tools).toMatchObject([{ name: 'mcp__server__tool', status: 'error', resultPosition: { tsMs: Date.parse(instant) } }]);
    expect(codes(output).get('claude_duplicate_tool_use')).toBe(1);
    expect(output.turns).toHaveLength(0);
  });
  it('I4 contradictory explicit result flags yield unknown once; orphans count per id', async () => {
    const output = await claude([call('a'), result('r1', 'call', true), result('r2', 'call', false),
      result('orphan1', 'missing', true), result('orphan2', 'missing', true)]);
    expect(output.tools[0]?.status).toBe('unknown');
    expect(codes(output).get('claude_tool_status_conflict')).toBe(1);
    expect(codes(output).get('orphan_tool_result')).toBe(1);
  });
  it('C7/I4 excludes meta/results-only rows, dedupes uuid turns, and counts missing identity once', async () => {
    const user = { type: 'user', timestamp: instant, sessionId: 's', uuid: 'u', message: { content: [{ type: 'text', text: 'PRIVATE' }] } };
    const output = await claude([user, user, { ...user, uuid: 'meta', isMeta: true },
      { ...user, uuid: undefined }, result('result-only', 'missing', false)]);
    expect(output.turns).toHaveLength(1);
    expect(codes(output).get('claude_duplicate_turn')).toBe(1);
    expect(codes(output).get('turn_identity_missing')).toBe(1);
  });
  it('canonical hashes sort object keys recursively and preserve array/scalar distinctions', () => {
    expect(canonicalInput({ z: 1, a: { c: true, b: [null, 'x'] } })).toBe('{"a":{"b":[null,"x"],"c":true},"z":1}');
    expect(canonicalInput([1, 2])).not.toBe(canonicalInput([2, 1]));
  });
  it('canonical input handles deeply nested valid JSON without recursive call-stack growth', () => {
    let value: unknown = 1;
    for (let index = 0; index < 5000; index += 1) value = [value];
    expect(canonicalInput(value)).toBe('['.repeat(5000) + '1' + ']'.repeat(5000));
  });
  it('C7 mixed primitive and tool-result content still constitutes a user turn', async () => {
    const output = await claude([{ type: 'user', uuid: 'mixed', timestamp: instant, message: {
      content: ['synthetic text', { type: 'tool_result', tool_use_id: 'missing' }],
    } }]);
    expect(output.turns).toHaveLength(1);
  });
  it('nonfinite input or host hash failure omits retry hash without aborting tools or accounting', async () => {
    const raw = call('a');
    (raw.message as { content: unknown[] }).content = [{ type: 'tool_use', id: 'call', name: 'tool', input: { n: Infinity } }];
    const parsed = await parseClaudeRecord(raw, { relativePath: 'a', sourceRef: { fileId: 'f1', line: 1 } }, platform);
    expect(parsed.row?.tools[0]?.inputHash).toBeUndefined();
    expect(reconcileClaude(parsed.row ? [parsed.row] : []).events).toHaveLength(1);
  });
  it('4.7 cap is visible and diagnostics evidence remains bounded while import counters stay exact', () => {
    const bag = new DiagnosticBag(new MetadataBudget(1000));
    for (let index = 0; index < 500; index += 1) bag.add({ category: 'skip', code: 'malformed_json', count: 1, sourceRef: { fileId: 'f1', line: index + 1 } });
    expect(bag.values).toHaveLength(1);
    expect(bag.values[0]?.count).toBe(500);
    const tiny = new DiagnosticBag(new MetadataBudget(0));
    tiny.add({ category: 'counter', code: 'assumed5m', count: 1, tsMs: 1 });
    expect(tiny.values).toMatchObject([{ code: 'metadata_cap_reached' }]);
  });
});
