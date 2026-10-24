import { describe, expect, it } from 'vitest';
import { analyzeRetries } from '../../src/core/retry';
import type { ToolFact } from '../../src/core/types';
const call = (id: string, tsMs: number, line: number, extra: Partial<ToolFact> = {}): ToolFact => ({
  agent: 'claude', sessionId: 's', callId: id, name: 'tool', inputHash: 'test-digest', tsMs,
  sourceRef: { fileId: 'f1', line }, status: 'ok', ...extra,
});
const failed = (id: string, time: number, line: number, extra: Partial<ToolFact> = {}) => call(id, time, line,
  { status: 'error', resultPosition: { tsMs: time + 1, sourceRef: { fileId: 'f1', line: line + 1 } }, ...extra });
describe('4.5/I4 canonical retries before filtering', () => {
  it('counts only an immediate same-name/hash repeat after an explicit preceding error result', () => {
    const value = analyzeRetries([failed('a', 0, 1), call('b', 2, 3), call('c', 3, 4)]);
    expect(value.retries).toEqual([{ tsMs: 2, sourceRef: { fileId: 'f1', line: 3 } }]);
    expect(value.diagnostics).toHaveLength(0);
  });
  it('success, unknown status, missing hash, changed input, or intervening different call cannot create retries', () => {
    for (const first of [call('a', 0, 1), call('a', 0, 1, { status: 'unknown' }), failed('a', 0, 1, { inputHash: undefined })])
      expect(analyzeRetries([first, call('b', 2, 3)]).retries).toHaveLength(0);
    expect(analyzeRetries([failed('a', 0, 1), call('middle', 2, 3, { name: 'other' }), call('b', 3, 4)]).retries).toHaveLength(0);
    expect(analyzeRetries([failed('a', 0, 1), call('b', 2, 3, { inputHash: 'different' })]).retries).toHaveLength(0);
  });
  it('isolates main/subagent streams and session IDs despite interleaved timestamps', () => {
    const value = analyzeRetries([failed('a', 0, 1), call('sub', 1, 2, { agentId: 'sub' }),
      call('other-session', 1, 2, { sessionId: 'other' }), call('b', 2, 3)]);
    expect(value.retries).toHaveLength(1);
  });
  it('late results cannot retroactively create retries, but same-file equal timestamps use strict line order', () => {
    expect(analyzeRetries([failed('a', 0, 1, { resultPosition: { tsMs: 5, sourceRef: { fileId: 'f1', line: 5 } } }), call('b', 2, 3)]).retries).toHaveLength(0);
    const first = failed('a', 0, 1, { resultPosition: { tsMs: 0, sourceRef: { fileId: 'f1', line: 2 } } });
    expect(analyzeRetries([call('b', 0, 3), first]).retries).toHaveLength(1);
  });
  it('each cross-file same-time candidate is ambiguous and no arbitrary tied predecessor survives', () => {
    const value = analyzeRetries([failed('a', 0, 1), call('b', 2, 3),
      failed('c', 2, 1, { sourceRef: { fileId: 'f2', line: 1 } }), call('d', 4, 5)]);
    expect(value.retries).toHaveLength(0);
    expect(value.diagnostics.filter(item => item.code === 'retry_ambiguous_order').reduce((sum, item) => sum + item.count, 0)).toBe(2);
  });
  it('cross-file equal-time result/candidate order is ambiguous, not a retry', () => {
    const first = failed('a', 0, 1, { resultPosition: { tsMs: 2, sourceRef: { fileId: 'f1', line: 2 } } });
    const value = analyzeRetries([first, call('b', 2, 1, { sourceRef: { fileId: 'f2', line: 1 } })]);
    expect(value.retries).toHaveLength(0); expect(value.diagnostics[0]?.code).toBe('retry_ambiguous_order');
  });
  it('Codex tool errors/retries remain unavailable, never inferred from status or output', () => {
    expect(analyzeRetries([failed('a', 0, 1, { agent: 'codex' }), call('b', 2, 3, { agent: 'codex' })]).retries).toHaveLength(0);
  });
});
