import { createHash } from 'node:crypto';
import { parseClaudeRecord } from '../../src/core/claude';
import { parseCodexFile } from '../../src/core/codex';
import type { JsonLine } from '../../src/core/lines';
import { reconcileClaude } from '../../src/core/reconcile';
import type { Platform } from '../../src/core/platform';
import type { UsageEvent } from '../../src/core/types';

export const platform: Platform = {
  decodeUtf8: bytes => new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes),
  sha256: async value => createHash('sha256').update(value).digest('hex'),
};
export const instant = '2026-10-14T10:00:00Z';
export function assistant(id = 'message', usage: Record<string, unknown> = {}, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { type: 'assistant', uuid: id, timestamp: instant, sessionId: 'session-a', cwd: '/synthetic/a', requestId: 'request',
    ...extra, message: { id, model: 'claude-test-a', stop_reason: 'end_turn',
      ...(extra.message as Record<string, unknown> | undefined), usage: { input_tokens: 10, output_tokens: 2, ...usage } } };
}
export async function claude(records: Record<string, unknown>[]) {
  const parsed = await Promise.all(records.map((record, index) => parseClaudeRecord(record,
    { sourceRef: { fileId: `f${index + 1}`, line: 1 }, relativePath: `claude/${index}.jsonl` }, platform)));
  const result = reconcileClaude(parsed.flatMap(item => item.row ? [item.row] : []));
  result.diagnostics.push(...parsed.flatMap(item => item.diagnostics));
  return result;
}
export const sessionA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const sessionB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export function at(second: number): string { return `2026-10-14T10:00:${second.toString().padStart(2, '0')}Z`; }
export function meta(id = sessionA, parent?: string): Record<string, unknown> {
  return { type: 'session_meta', timestamp: at(0), payload: { id, cwd: '/synthetic/codex', forked_from_id: parent } };
}
export function context(second = 1, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { type: 'turn_context', timestamp: at(second), payload: { model: 'gpt-test-x', cwd: '/synthetic/codex', turn_id: 'turn-a', ...extra } };
}
export function token(second: number, input: number, output = 0, extra: Record<string, unknown> = {}, last?: Record<string, unknown>): Record<string, unknown> {
  return { type: 'event_msg', timestamp: at(second), payload: { type: 'token_count',
    info: { total_token_usage: { input_tokens: input, output_tokens: output, ...extra }, last_token_usage: last } } };
}
export async function codexFile(records: Record<string, unknown>[], id = sessionA, fileId = 'f1', filename?: string) {
  const lines: JsonLine[] = records.map((value, index) => ({ kind: 'record', value, sourceRef: { fileId, line: index + 1 } }));
  const name = filename ?? `rollout-2026-10-14T10-00-00-${id}.jsonl`;
  return parseCodexFile(lines, name, name);
}
export function event(extra: Partial<UsageEvent> = {}): UsageEvent {
  return { agent: 'claude', sessionId: 's', projectKey: '/synthetic/a', model: 'claude-test-a', tsMs: Date.UTC(2026, 9, 14, 10),
    input: 0n, output: 0n, cacheRead: 0n, cacheWrite5m: 0n, cacheWrite1h: 0n, sidechain: false,
    assumed5m: false, quality: 'verified', observedEpoch: 0, modifiers: {}, sourceRef: { fileId: 'f1', line: 1 }, ...extra };
}
export function codes(result: { diagnostics: { code: string; count: number }[] }): Map<string, number> {
  const output = new Map<string, number>();
  for (const item of result.diagnostics) output.set(item.code, (output.get(item.code) ?? 0) + item.count);
  return output;
}
