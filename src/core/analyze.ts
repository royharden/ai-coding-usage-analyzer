import { aggregateEvents } from './aggregate';
import { parseClaudeRecord } from './claude';
import type { ClaudeRow } from './claude';
import { parseCodexFile, reconcileCodex } from './codex';
import type { CodexFile } from './codex';
import { DiagnosticBag } from './diagnostics';
import { MAX_EVIDENCE_PER_REASON, MetadataBudget } from './limits';
import { readJsonLines } from './lines';
import { behavioralMetrics, formatPercent, makeMetricTable } from './metrics';
import type { Platform } from './platform';
import { validatePriceTable } from './prices';
import { mergeReconciled, reconcileClaude } from './reconcile';
import { analyzeRetries } from './retry';
import { checkSizeBudget, SizeBudgetError } from './sizeBudget';
import { filterPredicate, validateFilters } from './time';
import type { Agent, CounterCode, Diagnostic, Report, SkipCode, UnresolvedCode } from './types';

export interface InputSource {
  agent: Agent; fileId: string; name: string; relativePath: string; size: number;
  read: () => AsyncIterable<Uint8Array>;
}
export interface AnalyzeOptions {
  tz: string; since?: string; until?: string; fullPaths?: boolean; allowLarge?: boolean; priceTableText: string;
  intakeDiagnostics?: readonly Diagnostic[]; metadataCap?: number;
}
const lineSkips = new Set<SkipCode>(['line_too_long', 'invalid_utf8', 'malformed_json', 'truncated_line',
  'bad_count', 'bad_timestamp', 'field_too_long', 'blank_line', 'synthetic_or_error_row']);
const hidingSkips = new Set<SkipCode>(['line_too_long', 'invalid_utf8', 'malformed_json', 'truncated_line',
  'bad_count', 'bad_timestamp', 'field_too_long', 'compressed_unsupported', 'file_read_error', 'codex_session_unidentified']);
function add<K extends string>(map: Map<K, number>, key: K, count: number): void { map.set(key, (map.get(key) ?? 0) + count); }

/** Pure host-independent pipeline: streams -> safe metadata -> reconciliation -> filtering -> report. */
export async function analyze(sources: readonly InputSource[], options: AnalyzeOptions, platform: Platform): Promise<Report> {
  const filters = validateFilters(options.tz, options.since, options.until), selected = filterPredicate(filters);
  const declared = sources.reduce((sum, source) => sum + source.size, 0);
  const decision = checkSizeBudget(declared, options.allowLarge ?? false);
  if (decision.kind !== 'allowed' || sources.some(source => !Number.isSafeInteger(source.size) || source.size < 0))
    throw new SizeBudgetError(decision.kind === 'allowed' ? { kind: 'refused', bytes: declared, reason: 'invalid_size' } : decision);
  const budget = new MetadataBudget(options.metadataCap);
  const diagnostics = new DiagnosticBag(budget);
  diagnostics.addAll(options.intakeDiagnostics ?? []);
  const ids = new Set<string>();
  for (const source of sources) {
    if (!/^f[1-9]\d*$/.test(source.fileId) || ids.has(source.fileId)) throw new Error('Invalid source identity');
    if (budget.reserve()) ids.add(source.fileId); else diagnostics.addAll(budget.diagnostic());
  }
  let parsedPrices: unknown;
  try { parsedPrices = JSON.parse(options.priceTableText) as unknown; } catch { throw new Error('Invalid price table JSON'); }
  const prices = validatePriceTable(parsedPrices);
  const priceTableDigest = await platform.sha256(options.priceTableText);
  if (!/^[a-f0-9]{64}$/.test(priceTableDigest)) throw new Error('Invalid price-table digest');
  const claudeRows: ClaudeRow[] = [], codexFiles: CodexFile[] = [];
  let bytesRead = 0, filesRead = 0, rowsRead = 0, unidentifiedLines = 0;
  // rule 4.7: declared byte sizes are advisory; enforce the same policy on actual streamed bytes.
  async function* bytes(source: InputSource, state: { failed: boolean }): AsyncGenerator<Uint8Array> {
    try {
      for await (const chunk of source.read()) {
        bytesRead += chunk.byteLength;
        const current = checkSizeBudget(bytesRead, options.allowLarge ?? false);
        if (current.kind !== 'allowed') throw new SizeBudgetError(current);
        yield chunk;
      }
    } catch (error) {
      if (error instanceof SizeBudgetError) throw error;
      state.failed = true;
      diagnostics.add({ category: 'skip', code: 'file_read_error', count: 1, sourceRef: { fileId: source.fileId, line: 0 } });
    }
  }
  for (const source of sources) {
    const name = source.name.toLowerCase();
    if (name.endsWith('.zst')) { diagnostics.add({ category: 'skip', code: 'compressed_unsupported', count: 1 }); continue; }
    if (!name.endsWith('.jsonl')) { diagnostics.add({ category: 'skip', code: 'ignored_non_jsonl', count: 1 }); continue; }
    filesRead += 1;
    const state = { failed: false };
    async function* checkedLines() {
      for await (const line of readJsonLines(bytes(source, state), source.fileId, platform)) {
        // A failed read cannot prove an empty file or a complete unterminated final record.
        // Earlier LF-terminated records were yielded before the failure and remain usable.
        if (!state.failed) yield line;
      }
    }
    const lines = checkedLines();
    if (source.agent === 'codex') {
      const file = await parseCodexFile(lines, source.name, source.relativePath, budget);
      rowsRead += file.rowsRead; unidentifiedLines += file.unidentifiedLines;
      diagnostics.addAll(file.diagnostics);
      if (file.records.length > 0) {
        if (budget.reserve()) codexFiles.push({ ...file, diagnostics: [] }); else diagnostics.addAll(budget.diagnostic());
      }
    } else for await (const line of lines) {
      if (line.sourceRef.line > 0) rowsRead += 1;
      if (line.kind === 'skip') diagnostics.add(line.diagnostic);
      else {
        const parsed = await parseClaudeRecord(line.value, { sourceRef: line.sourceRef, relativePath: source.relativePath }, platform, budget);
        diagnostics.addAll(parsed.diagnostics); if (parsed.row) claudeRows.push(parsed.row);
      }
    }
  }
  const reconciled = mergeReconciled(reconcileClaude(claudeRows, budget), reconcileCodex(codexFiles, budget));
  diagnostics.addAll(reconciled.diagnostics);
  // rule I4: compute predecessor/result chronology on the full, unfiltered stream.
  const retry = analyzeRetries(reconciled.tools, budget);
  diagnostics.addAll(retry.diagnostics);
  // rule I6: only now filter each family by its normative timestamp; import-wide reasons survive.
  const events = reconciled.events.filter(event => selected(event.tsMs));
  const aggregate = aggregateEvents(events, prices, filters.tz, options.fullPaths ?? false, budget);
  diagnostics.addAll(aggregate.diagnostics);
  const behavior = behavioralMetrics(reconciled.tools.filter(tool => selected(tool.tsMs)), reconciled.turns.filter(turn => selected(turn.tsMs)),
    reconciled.timestamps.filter(timestamp => selected(timestamp.tsMs)), budget);
  diagnostics.addAll(behavior.diagnostics);
  const skipped = new Map<SkipCode, number>(), unresolved = new Map<UnresolvedCode, number>(), counters = new Map<CounterCode, number>();
  const evidence: Report['evidence'] = [], evidenceCounts = new Map<string, number>();
  let hiddenRows = unidentifiedLines;
  for (const item of diagnostics.values) {
    if (item.category === 'skip' && lineSkips.has(item.code)) hiddenRows += item.count;
    if (item.code === 'ignored_record_kind' || item.code === 'codex_token_count_empty') hiddenRows += item.count;
    if (item.tsMs !== undefined && !selected(item.tsMs)) continue;
    if (item.category === 'skip') add(skipped, item.code, item.count);
    else if (item.category === 'unresolved') add(unresolved, item.code, item.count);
    else add(counters, item.code, item.count);
    const key = `${item.category}:${item.code}`, count = evidenceCounts.get(key) ?? 0;
    if (item.sourceRef && count < MAX_EVIDENCE_PER_REASON) {
      evidence.push({ category: item.category, code: item.code, sourceRef: { fileId: item.sourceRef.fileId, line: item.sourceRef.line } });
      evidenceCounts.set(key, count + 1);
    }
  }
  counters.set('rowsRead', rowsRead); counters.set('rowsRecognised', rowsRead - hiddenRows);
  const numerator = aggregate.tokens.cacheRead;
  const denominator = aggregate.tokens.input + aggregate.tokens.cacheRead + aggregate.tokens.cacheWrite5m + aggregate.tokens.cacheWrite1h;
  const complete = unresolved.size === 0 && aggregate.events.byQuality.observed_epoch === 0 && aggregate.events.byQuality.observed_snapshot === 0 &&
    ![...skipped].some(([code, count]) => count > 0 && hidingSkips.has(code));
  const report: Report = {
    schema: 's22-report/1', metadata: { ...filters, priceTableDigest, priceTableSchema: 'pricetable/1', parserSchema: 's22-parser/1',
      fullPaths: options.fullPaths ?? false, bytesRead, filesRead }, complete,
    tokens: aggregate.tokens, tokensByQuality: aggregate.tokensByQuality, cost: aggregate.cost,
    cacheHit: { numerator, denominator, display: formatPercent(numerator, denominator) },
    events: aggregate.events, modelCalls: aggregate.events.total, turns: behavior.turns, tools: behavior.tools, toolResults: behavior.toolResults,
    retries: retry.retries.filter(fact => selected(fact.tsMs)).length, retryAmbiguous: counters.get('retry_ambiguous_order') ?? 0,
    errorRate: behavior.errorRate, codexRetries: 'not available', sessionDurations: behavior.sessionDurations, groupings: aggregate.groupings,
    skipped, unresolved, counters, evidence, metricTable: new Map(),
  };
  report.metricTable = makeMetricTable(report);
  return report;
}
