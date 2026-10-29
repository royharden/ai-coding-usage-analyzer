import { asRecord } from './lines';
import { DiagnosticBag } from './diagnostics';
import type { JsonLine } from './lines';
import { identityTooLong, MetadataBudget } from './limits';
import { parseTimestamp } from './timestamp';
import { compareAttribution, compareText, count, modifierValue, optionalText, text } from './validation';
import { emptyReconciled } from './types';
import type { Attribution, Diagnostic, Quality, Reconciled, SourceLocation, UnresolvedCode } from './types';

export interface CodexVector { input: bigint; cached: bigint; output: bigint; reasoning: bigint; write: bigint }
interface Base extends SourceLocation { tsMs: number; sessionId: string }
export type CodexRecord = Base & (
  { kind: 'meta'; id: string; parent?: string; cwd: string; sidechain: boolean } |
  { kind: 'context'; model: string; cwd: string; turnId?: string } |
  { kind: 'tier'; tier?: string; invalidModifier: boolean } |
  { kind: 'token'; total: CodexVector; last?: CodexVector; turnId?: string } |
  { kind: 'tool'; toolKind: string; callId: string; name: string; output: boolean }
);
export interface CodexFile {
  sessionId?: string; records: CodexRecord[]; diagnostics: Diagnostic[];
  rowsRead: number;
  /** Parsed lines consumed by an unidentified file, excluding already-counted line skips. */
  unidentifiedLines: number;
}
type PendingRecord = { record?: CodexRecord; diagnostic?: Diagnostic; meta?: { id: string; parent?: string } };
const dimensions = ['input', 'cached', 'output', 'reasoning', 'write'] as const;
const zeroVector = (): CodexVector => ({ input: 0n, cached: 0n, output: 0n, reasoning: 0n, write: 0n });
function vector(value: unknown, allOptional = false): CodexVector | undefined {
  const object = asRecord(value);
  if (!object) return undefined;
  const input = count(object.input_tokens, allOptional), output = count(object.output_tokens, allOptional);
  const cached = count(object.cached_input_tokens, true), reasoning = count(object.reasoning_output_tokens, true);
  const write = count(object.cache_write_input_tokens, true);
  if (input === undefined || output === undefined || cached === undefined || reasoning === undefined || write === undefined) return undefined;
  return { input, cached, output, reasoning, write };
}
function vectorKey(value: CodexVector | undefined): string[] | null {
  return value ? dimensions.map(key => value[key].toString()) : null;
}
export function vectorEqual(a: CodexVector, b: CodexVector): boolean { return dimensions.every(key => a[key] === b[key]); }
function compareVector(a: CodexVector, b: CodexVector): number {
  for (const key of dimensions) if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
  return 0;
}
function leq(a: CodexVector, b: CodexVector): boolean { return dimensions.every(key => a[key] <= b[key]); }
function valid(value: CodexVector): boolean { return value.cached <= value.input && value.reasoning <= value.output; }
function delta(value: CodexVector, baseline: CodexVector): CodexVector {
  return { input: value.input - baseline.input, cached: value.cached - baseline.cached, output: value.output - baseline.output,
    reasoning: value.reasoning - baseline.reasoning, write: value.write - baseline.write };
}

function parseRecord(value: Record<string, unknown>, location: SourceLocation): PendingRecord {
  const payload = asRecord(value.payload) ?? {};
  const isToken = value.type === 'event_msg' && payload.type === 'token_count';
  const info = asRecord(payload.info);
  const empty = isToken && (!info || info.total_token_usage === undefined);
  let total: CodexVector | undefined, last: CodexVector | undefined;
  const diagnostic = (code: 'bad_count' | 'bad_timestamp' | 'field_too_long'): PendingRecord => ({
    diagnostic: { category: 'skip', code, count: 1, sourceRef: location.sourceRef },
  });
  // rule I1: required total input/output; every absent last component defaults to zero.
  // rule N1
  if (isToken && !empty) {
    total = vector(info?.total_token_usage);
    if (info?.last_token_usage !== undefined) last = vector(info.last_token_usage, true);
    if (!total || (info?.last_token_usage !== undefined && !last)) return diagnostic('bad_count');
  }
  const meta = value.type === 'session_meta' && !identityTooLong([payload.id, payload.forked_from_id]) ?
    { id: text(payload.id), parent: optionalText(payload.forked_from_id) } : undefined;
  // rule I1: timestamp validation applies BEFORE empty/unsupported kind handling.
  const tsMs = parseTimestamp(value.timestamp);
  if (tsMs === undefined) return { ...diagnostic('bad_timestamp'), meta };
  const settings = asRecord(payload.thread_settings);
  if (identityTooLong([payload.id, payload.forked_from_id, payload.cwd, payload.model, payload.turn_id,
    payload.call_id, payload.name, settings?.service_tier])) return { ...diagnostic('field_too_long'), meta };
  const base: Base = { ...location, tsMs, sessionId: '' };
  if (value.type === 'session_meta') {
    const source = asRecord(payload.source);
    return { meta, record: { ...base, kind: 'meta', id: text(payload.id), parent: optionalText(payload.forked_from_id),
      cwd: text(payload.cwd, 'unknown'), sidechain: asRecord(source?.subagent) !== undefined } };
  }
  if (value.type === 'turn_context') return { record: { ...base, kind: 'context', model: text(payload.model, 'unknown'),
    cwd: text(payload.cwd, 'unknown'), turnId: optionalText(payload.turn_id) } };
  if (value.type === 'event_msg' && payload.type === 'thread_settings_applied') return {
    record: { ...base, kind: 'tier', tier: modifierValue(settings?.service_tier),
      invalidModifier: settings?.service_tier !== undefined && settings.service_tier !== null && typeof settings.service_tier !== 'string' },
  };
  if (empty) return { diagnostic: { category: 'counter', code: 'codex_token_count_empty', count: 1, sourceRef: location.sourceRef } };
  if (isToken && total) return { record: { ...base, kind: 'token', total, last, turnId: optionalText(payload.turn_id) } };
  // rule X1c
  // rule X9: only calls/outputs are read; output text and arguments are discarded immediately.
  const toolKind = text(payload.type);
  if (value.type === 'response_item' && ['function_call', 'custom_tool_call', 'function_call_output', 'custom_tool_call_output'].includes(toolKind))
    return { record: { ...base, kind: 'tool', toolKind, callId: text(payload.call_id), name: text(payload.name, 'unknown'),
      output: toolKind.endsWith('_output') } };
  return { diagnostic: { category: 'counter', code: 'ignored_record_kind', count: 1, sourceRef: location.sourceRef } };
}

/** Streaming raw lines are sanitized individually. Raw records never accumulate while finding file identity. */
export async function parseCodexFile(lines: AsyncIterable<JsonLine> | Iterable<JsonLine>, filename: string,
  relativePath: string, budget = new MetadataBudget()): Promise<CodexFile> {
  const pending: CodexRecord[] = [], diagnostics = new DiagnosticBag(budget), recordDiagnostics = new DiagnosticBag(budget);
  const ids = new Set<string>(), parents = new Set<string>();
  let rowsRead = 0, parsedLines = 0;
  for await (const line of lines) {
    if (line.sourceRef.line > 0) rowsRead += 1;
    if (line.kind === 'skip') { diagnostics.add(line.diagnostic); continue; }
    parsedLines += 1;
    const item = parseRecord(line.value, { sourceRef: line.sourceRef, relativePath });
    if (item.meta?.id && !ids.has(item.meta.id)) {
      if (budget.reserve()) ids.add(item.meta.id); else diagnostics.addAll(budget.diagnostic());
    }
    if (item.meta?.parent && !parents.has(item.meta.parent)) {
      if (budget.reserve()) parents.add(item.meta.parent); else diagnostics.addAll(budget.diagnostic());
    }
    if (item.diagnostic) recordDiagnostics.add(item.diagnostic);
    if (item.record) {
      if (budget.reserve()) pending.push(item.record); else diagnostics.addAll(budget.diagnostic());
    }
  }
  // rule X1: filename UUID wins; otherwise uniquely remove embedded-parent ids, order independently.
  const match = /rollout-.*-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i.exec(filename);
  const own = [...ids].filter(id => !parents.has(id));
  const sessionId = match?.[1] ?? (own.length === 1 ? own[0] : undefined);
  budget.release(ids.size + parents.size);
  if (!sessionId) {
    diagnostics.add({ category: 'skip', code: 'codex_session_unidentified', count: 1 });
    return { records: [], diagnostics: diagnostics.values, rowsRead, unidentifiedLines: parsedLines };
  }
  diagnostics.addAll(recordDiagnostics.values);
  for (const record of pending) record.sessionId = sessionId;
  return { sessionId, records: pending, diagnostics: diagnostics.values, rowsRead, unidentifiedLines: 0 };
}

function identity(record: CodexRecord): string {
  // rule X1: total_tokens intentionally excluded from both vectors and every identity.
  switch (record.kind) {
    case 'meta': return JSON.stringify(['meta', record.id, record.parent ?? null, record.tsMs]);
    case 'context': return JSON.stringify(['context', record.sessionId, record.tsMs, record.turnId ?? null, record.model, record.cwd]);
    case 'tier': return JSON.stringify(['tier', record.sessionId, record.tsMs, record.tier ?? null, record.invalidModifier]);
    case 'token': return JSON.stringify(['token', record.sessionId, record.tsMs, record.turnId ?? null, vectorKey(record.total), vectorKey(record.last)]);
    case 'tool': return JSON.stringify(['tool', record.sessionId, record.toolKind, record.callId]);
  }
}
function attribution(record: CodexRecord): Attribution {
  return { ...record, projectKey: record.kind === 'context' || record.kind === 'meta' ? record.cwd : '',
    sidechain: record.kind === 'meta' && record.sidechain, modifiers: record.kind === 'tier' ? { serviceTier: record.tier } : {} };
}
function rank(record: CodexRecord): number {
  return ({ meta: 0, tier: 1, context: 2, token: 3, tool: 4 })[record.kind];
}
// rule X2: componentwise comparable totals sort lexically, then full last, then turn id.
function compareRecords(a: CodexRecord, b: CodexRecord): number {
  const first = a.tsMs - b.tsMs || rank(a) - rank(b);
  if (first) return first;
  if (a.kind === 'token' && b.kind === 'token') {
    const totals = compareVector(a.total, b.total);
    if (totals) return totals;
    if (a.last === undefined && b.last !== undefined) return -1;
    if (a.last !== undefined && b.last === undefined) return 1;
    const lasts = a.last && b.last ? compareVector(a.last, b.last) : 0;
    if (lasts) return lasts;
    const turns = compareText(a.turnId, b.turnId);
    if (turns) return turns;
  }
  return compareAttribution(attribution(a), attribution(b));
}
type TokenRecord = Extract<CodexRecord, { kind: 'token' }>;
type Context = { model: string; cwd: string };
const contextKey = (context: Context): string => JSON.stringify([context.model, context.cwd]);

/** X10 is the sole Codex accountant; other helpers only sanitize, dedupe and order. */
// rule X10
export function reconcileCodex(files: readonly CodexFile[], budget = new MetadataBudget()): Reconciled {
  const result = emptyReconciled();
  const diagnostics = new DiagnosticBag(budget);
  result.diagnostics = diagnostics.values;
  const retain = (): boolean => {
    if (budget.reserve()) return true;
    diagnostics.addAll(budget.diagnostic()); return false;
  };
  const sessions = new Map<string, Map<string, CodexRecord>>();
  for (const file of files) {
    diagnostics.addAll(file.diagnostics);
    if (!file.sessionId) continue;
    let records = sessions.get(file.sessionId);
    if (!records) { if (!retain()) continue; records = new Map(); sessions.set(file.sessionId, records); }
    for (const record of file.records) {
      const key = identity(record), previous = records.get(key);
      if (previous) {
        diagnostics.add({ category: 'counter', code: 'duplicate_copy', count: 1, sourceRef: record.sourceRef });
        if (compareAttribution(attribution(record), attribution(previous)) < 0) records.set(key, record);
      } else if (retain()) records.set(key, record);
    }
  }
  const streams = new Map([...sessions].map(([id, records]) => [id, [...records.values()].sort(compareRecords)]));
  for (const [sessionId, records] of streams) {
    const ownMetas = records.filter((record): record is Extract<CodexRecord, { kind: 'meta' }> => record.kind === 'meta' && record.id === sessionId);
    const meta = ownMetas[0], parent = meta?.parent, parentRecords = parent ? streams.get(parent) : undefined;
    const counter = (code: Extract<Diagnostic, { category: 'counter' }>['code'], record?: CodexRecord, importWide = false): void => {
      diagnostics.add({ category: 'counter', code, count: 1, tsMs: importWide ? undefined : record?.tsMs, sourceRef: record?.sourceRef });
    };
    const fault = (code: UnresolvedCode, record: CodexRecord): void => {
      diagnostics.add({ category: 'unresolved', code, count: 1, tsMs: record.tsMs, sourceRef: record.sourceRef });
    };
    for (const record of records) {
      if (record.kind === 'meta' && record.id !== sessionId) counter('codex_embedded_parent_meta', record, true); // rule X1b
      else if (retain()) result.timestamps.push({ agent: 'codex', sessionId, tsMs: record.tsMs });
    }
    if (parent && !parentRecords) counter('codex_fork_history_unverified', undefined, true); // rule I5
    const parentTurns = new Set(parentRecords?.flatMap(record => record.kind === 'context' && record.turnId ? [record.turnId] : []) ?? []);
    const parentTools = new Set(parentRecords?.flatMap(record => record.kind === 'tool' ? [JSON.stringify([record.toolKind, record.callId])] : []) ?? []);
    const countedTurns = new Set<string>();
    // rule I5
    // rule X1d
    // rule X9: replay suppression affects metrics, never context updates.
    for (const record of records) {
      if (record.kind === 'context') {
        if (parentRecords && record.turnId && parentTurns.has(record.turnId)) { counter('codex_replay_turn_dropped', record); continue; }
        const id = record.turnId ?? identity(record);
        if (!countedTurns.has(id) && retain() && retain()) {
          countedTurns.add(id);
          result.turns.push({ agent: 'codex', sessionId, turnId: id, tsMs: record.tsMs, sourceRef: record.sourceRef });
        }
      } else if (record.kind === 'tool') {
        if (parentRecords && parentTools.has(JSON.stringify([record.toolKind, record.callId]))) { counter('codex_replay_tool_dropped', record); continue; }
        if (!record.output && retain()) result.tools.push({ agent: 'codex', sessionId, callId: record.callId, name: record.name,
          tsMs: record.tsMs, sourceRef: record.sourceRef, status: 'unknown' });
      }
    }
    const tokens = records.filter((record): record is TokenRecord => record.kind === 'token');
    const parentTokens = parentRecords?.filter((record): record is TokenRecord => record.kind === 'token') ?? [];
    const replay = new Set<TokenRecord>();
    // rule X8: prefix proof precedes a self-proving zero start, without recursion or timestamp equality.
    for (let index = 0; parentRecords && index < tokens.length && index < parentTokens.length; index += 1) {
      const child = tokens[index], ancestor = parentTokens[index];
      if (!child || !ancestor || !vectorEqual(child.total, ancestor.total) || child.turnId !== ancestor.turnId) break;
      if (retain()) replay.add(child); else break;
    }
    let baseline: CodexVector | 'pending' | undefined;
    let replayEnabled = true;
    let mode: Quality = 'verified', epoch = 0;
    let ctx: Context | 'ambiguous' | undefined, tier: string | undefined, tierAmbiguous = false, invalidModifier = false;
    let position = 0;
    while (position < records.length) {
      const first = records[position];
      if (!first) break;
      const group: CodexRecord[] = [];
      while (records[position]?.tsMs === first.tsMs) { const record = records[position++]; if (record) group.push(record); }
      const settings = group.filter((record): record is Extract<CodexRecord, { kind: 'tier' }> => record.kind === 'tier');
      if (settings.length > 0) {
        tierAmbiguous = new Set(settings.map(record => record.tier)).size > 1;
        tier = tierAmbiguous ? undefined : settings[0]?.tier;
        invalidModifier = settings.some(record => record.invalidModifier);
      }
      const contexts = group.filter((record): record is Extract<CodexRecord, { kind: 'context' }> => record.kind === 'context');
      let switched = false;
      if (contexts.length > 0) {
        const keys = new Set(contexts.map(contextKey));
        if (keys.size > 1) ctx = 'ambiguous';
        else {
          const next = contexts[0];
          if (next) {
            switched = ctx !== undefined && (ctx === 'ambiguous' || contextKey(ctx) !== contextKey(next));
            ctx = { model: next.model, cwd: next.cwd };
          }
        }
      }
      const steps = group.filter((record): record is TokenRecord => record.kind === 'token');
      // rule X10.2: one outcome for the entire incomparable tied set, even at session start.
      if (steps.some((step, index) => index > 0 && !leq(steps[index - 1]?.total ?? zeroVector(), step.total))) {
        const step = steps[0];
        if (step) { fault('codex_ambiguous_order', step); baseline = 'pending'; replayEnabled = false; }
        continue;
      }
      for (const step of steps) {
        const v = step.total;
        // rule X10.1
        if (replayEnabled && replay.has(step)) { baseline = v; mode = 'verified'; counter('codex_replay_dropped', step); continue; }
        if (baseline === undefined) {
          if ((step.last && vectorEqual(v, step.last)) || (meta && !parent && !step.last)) baseline = zeroVector();
          else {
            fault(parent ? 'codex_fork_unproven_prefix' : meta ? 'codex_inherited_start' : 'codex_session_meta_missing', step);
            baseline = valid(v) ? v : 'pending'; mode = 'observed_epoch'; epoch += 1;
            counter('baseline_reset_assumed', step); continue;
          }
        }
        // rule X10.3
        if (baseline === 'pending') {
          if (valid(v)) { baseline = v; mode = 'observed_epoch'; epoch += 1; counter('baseline_reset_assumed', step); }
          continue;
        }
        // rule X4
        const d = delta(v, baseline);
        // rule X7 / rule X10.4
        if (dimensions.some(key => d[key] < 0n)) {
          fault('codex_total_regressed', step); baseline = valid(v) ? v : 'pending'; mode = 'observed_epoch';
          if (baseline !== 'pending') { epoch += 1; counter('baseline_reset_assumed', step); }
          continue;
        }
        // rule X10.5: repeats never check last, bucket faults or context.
        if (vectorEqual(d, zeroVector())) { counter('codex_repeat_total', step); continue; }
        baseline = v;
        // rule X5
        // rule X5b
        // rule X10.6: exact baseline survives bucket faults.
        if (d.cached > d.input) { fault('codex_cached_exceeds_input', step); continue; }
        if (d.write > 0n) { fault('codex_cache_write_unmodeled', step); continue; }
        if (d.reasoning > d.output) { fault('codex_reasoning_exceeds_output', step); continue; }
        // rule X3 / rule X10.7
        if (ctx === 'ambiguous') { fault('codex_ambiguous_context', step); continue; }
        if (switched) { fault('codex_ambiguous_order', step); continue; }
        // rule X6 / rule X10.8
        if (step.last && !vectorEqual(step.last, d)) counter('codex_last_delta_mismatch', step);
        if (retain()) result.events.push({ agent: 'codex', sessionId, projectKey: ctx?.cwd ?? meta?.cwd ?? 'unknown', model: ctx?.model ?? 'unknown',
          tsMs: step.tsMs, input: d.input - d.cached, output: d.output, cacheRead: d.cached, cacheWrite5m: 0n, cacheWrite1h: 0n,
          sidechain: meta?.sidechain ?? false, assumed5m: false, quality: mode, observedEpoch: mode === 'observed_epoch' ? epoch : 0,
          modifiers: { serviceTier: tier, tierAmbiguous, invalidModifier }, sourceRef: step.sourceRef });
      }
    }
  }
  return result;
}
