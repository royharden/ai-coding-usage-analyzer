import { DiagnosticBag } from './diagnostics';
import type { ClaudeRow, ClaudeUsage } from './claude';
import { MetadataBudget } from './limits';
import { compareAttribution } from './validation';
import { emptyReconciled } from './types';
import type { CounterCode, Diagnostic, Reconciled, ToolFact, UnresolvedCode, UsageEvent } from './types';

export function usageKey(usage: ClaudeUsage): string {
  return JSON.stringify([usage.model, usage.input.toString(), usage.output.toString(), usage.cacheWrite5m.toString(),
    usage.cacheWrite1h.toString(), usage.cacheRead.toString(), usage.assumed5m]);
}
function selected(rows: readonly ClaudeRow[]): ClaudeRow {
  const first = [...rows].sort(compareAttribution)[0];
  if (!first) throw new Error('Empty candidate set');
  return first;
}
function pushCounter(diagnostics: DiagnosticBag, code: CounterCode, row: ClaudeRow, count = 1): void {
  if (count > 0) diagnostics.add({ category: 'counter', code, count, tsMs: row.tsMs, sourceRef: row.sourceRef });
}
function unresolved(diagnostics: DiagnosticBag, code: UnresolvedCode, row: ClaudeRow): void {
  diagnostics.add({ category: 'unresolved', code, count: 1, tsMs: row.tsMs, sourceRef: row.sourceRef });
}

/** Grouping is global across every selected Claude file and independent of input order. */
export function reconcileClaude(rows: readonly ClaudeRow[], budget = new MetadataBudget()): Reconciled {
  const output = emptyReconciled();
  const diagnostics = new DiagnosticBag(budget);
  output.diagnostics = diagnostics.values;
  const messages = new Map<string, Map<string | null, ClaudeRow[]>>();
  const toolCopies = new Map<string, { row: ClaudeRow; index: number }[]>();
  const resultCopies = new Map<string, { row: ClaudeRow; flag?: boolean }[]>();
  const turns = new Map<string, ClaudeRow[]>();
  const rowCodes = new Map<string, Set<string>>();
  const syntheticRows = new Set<string>();
  const rowUnresolved = new Set<string>();
  const reserve = (): boolean => {
    if (budget.reserve()) return true;
    diagnostics.addAll(budget.diagnostic()); return false;
  };
  function distinctRow(code: CounterCode, row: ClaudeRow): void {
    let ids = rowCodes.get(code);
    if (!ids) { if (!reserve()) return; ids = new Set(); rowCodes.set(code, ids); }
    if (!ids.has(row.rowId) && reserve()) { ids.add(row.rowId); pushCounter(diagnostics, code, row); }
  }
  for (const row of [...rows].sort(compareAttribution)) {
    if (!reserve()) break;
    for (const code of row.rowCounters) distinctRow(code, row);
    if (row.syntheticSkip) {
      if (!syntheticRows.has(row.rowId) && reserve()) {
        syntheticRows.add(row.rowId);
        diagnostics.add({ category: 'skip', code: 'synthetic_or_error_row', count: 1, sourceRef: row.sourceRef });
      }
      continue;
    }
    if (reserve()) output.timestamps.push({ agent: 'claude', sessionId: row.sessionId, tsMs: row.tsMs });
    if (row.usage) {
      const id = row.usage.messageId;
      if (!id) {
        // rule C2: no usage event without a safe identity; tools still survive.
        if (!rowUnresolved.has(row.rowId) && reserve()) { rowUnresolved.add(row.rowId); unresolved(diagnostics, 'no_identity', row); }
      } else {
        let requests = messages.get(id);
        if (!requests) { if (!reserve()) break; requests = new Map(); messages.set(id, requests); }
        const group = requests.get(row.usage.requestId);
        if (group) group.push(row); else requests.set(row.usage.requestId, [row]);
      }
    }
    for (let index = 0; index < row.tools.length; index += 1) {
      const tool = row.tools[index];
      if (!tool || !reserve()) break;
      const copies = toolCopies.get(tool.id);
      if (copies) copies.push({ row, index }); else toolCopies.set(tool.id, [{ row, index }]);
    }
    for (const result of row.results) {
      if (!reserve()) break;
      const copies = resultCopies.get(result.id);
      if (copies) copies.push({ row, flag: result.flag }); else resultCopies.set(result.id, [{ row, flag: result.flag }]);
    }
    if (row.turnId && reserve()) {
      const copies = turns.get(row.turnId);
      if (copies) copies.push(row); else turns.set(row.turnId, [row]);
    }
  }
  for (const requests of messages.values()) {
    const nullRows = requests.get(null);
    const named = [...requests.entries()].filter(([key]) => key !== null);
    // rule C2: match any logged row, including snapshots, only after all files arrive.
    if (nullRows && named.length > 0) {
      requests.delete(null);
      for (const row of nullRows) {
        const usage = row.usage;
        if (!usage) continue;
        const matches = named.filter(([, group]) => group.some(candidate => {
          const other = candidate.usage;
          return other !== undefined && (usage.splitMismatch ?
            usage.model === other.model && usage.rawUsageKey === other.rawUsageKey : usageKey(usage) === usageKey(other));
        }));
        if (matches.length === 1) { matches[0]?.[1].push(row); distinctRow('request_id_missing_merged', row); }
        else if (!rowUnresolved.has(row.rowId)) { rowUnresolved.add(row.rowId); unresolved(diagnostics, 'request_id_conflict', row); }
      }
    }
    for (const group of requests.values()) resolveGroup(group, output, diagnostics, reserve);
  }
  // rule I4 / rule C6: explicit flags decide status; absent copies add no information.
  for (const [id, copies] of toolCopies) {
    const chosenCopy = [...copies].sort((a, b) => compareAttribution(a.row, b.row) || a.index - b.index)[0];
    if (!chosenCopy) continue;
    const row = chosenCopy.row, tool = row.tools[chosenCopy.index];
    if (!tool) continue;
    pushCounter(diagnostics, 'claude_duplicate_tool_use', row, copies.length - 1);
    const results = resultCopies.get(id) ?? [];
    const flags = new Set(results.flatMap(result => result.flag === undefined ? [] : [result.flag]));
    if (flags.size > 1) pushCounter(diagnostics, 'claude_tool_status_conflict', row);
    const status: ToolFact['status'] = flags.size !== 1 ? 'unknown' : flags.has(true) ? 'error' : 'ok';
    // For retry chronology use the earliest explicitly matching result, not a later absent-flag copy.
    const explicit = results.filter(result => result.flag !== undefined).map(result => result.row);
    const resultRow = explicit.length > 0 ? selected(explicit) : undefined;
    if (reserve()) output.tools.push({ agent: 'claude', sessionId: row.sessionId, agentId: row.agentId, callId: id, name: tool.name,
      tsMs: row.tsMs, sourceRef: row.sourceRef, status, inputHash: tool.inputHash,
      resultPosition: resultRow ? { tsMs: resultRow.tsMs, sourceRef: resultRow.sourceRef } : undefined });
  }
  for (const [id, copies] of resultCopies) {
    if (!toolCopies.has(id)) pushCounter(diagnostics, 'orphan_tool_result', selected(copies.map(copy => copy.row)));
  }
  // rule C7 / rule I4
  for (const [turnId, copies] of turns) {
    const row = selected(copies);
    pushCounter(diagnostics, 'claude_duplicate_turn', row, copies.length - 1);
    if (reserve()) output.turns.push({ agent: 'claude', sessionId: row.sessionId, turnId, tsMs: row.tsMs, sourceRef: row.sourceRef });
  }
  return output;
}

function resolveGroup(group: ClaudeRow[], output: Reconciled, diagnostics: DiagnosticBag, reserve: () => boolean): void {
  const earliest = selected(group);
  pushCounter(diagnostics, 'claude_duplicate_rows', earliest, group.length - 1);
  const usages = group.flatMap(row => row.usage ? [row.usage] : []);
  // rule I2: exactly one reason, highest precedence first.
  if (new Set(usages.map(usage => usage.model)).size > 1) { unresolved(diagnostics, 'claude_model_conflict', earliest); return; }
  if (usages.some(usage => usage.splitMismatch)) { unresolved(diagnostics, 'cache_split_mismatch', earliest); return; }
  const vectors = new Set(usages.map(usageKey));
  const terminal = group.filter(row => row.usage?.terminal);
  const terminalVectors = new Set(terminal.flatMap(row => row.usage ? [usageKey(row.usage)] : []));
  // rule C3
  if (vectors.size > 1 && terminalVectors.size !== 1) { unresolved(diagnostics, 'claude_conflicting_duplicates', earliest); return; }
  const candidates = vectors.size === 1 ? group : terminal;
  const chosen = selected(candidates), usage = chosen.usage;
  if (!usage) return;
  const quality = terminal.length === 0 ? 'observed_snapshot' : 'verified';
  // rule C3b: every copied attribute comes from this single I3 candidate.
  if (new Set(candidates.map(row => JSON.stringify([row.sessionId, row.projectKey]))).size > 1)
    pushCounter(diagnostics, 'claude_attribution_conflict', earliest);
  if (quality === 'observed_snapshot') pushCounter(diagnostics, 'claude_nonterminal_snapshot', chosen);
  if (usage.assumed5m) pushCounter(diagnostics, 'assumed5m', chosen);
  // rule C4
  const event: UsageEvent = { agent: 'claude', sessionId: chosen.sessionId, projectKey: chosen.projectKey, model: usage.model,
    tsMs: chosen.tsMs, input: usage.input, output: usage.output, cacheWrite5m: usage.cacheWrite5m,
    cacheWrite1h: usage.cacheWrite1h, cacheRead: usage.cacheRead, sidechain: chosen.sidechain,
    assumed5m: usage.assumed5m, quality, observedEpoch: 0, modifiers: chosen.modifiers, sourceRef: chosen.sourceRef };
  if (reserve()) output.events.push(event);
}

/** Merge safe reconciled populations without changing their filtering timestamps. */
export function mergeReconciled(...parts: readonly Reconciled[]): Reconciled {
  const output = emptyReconciled();
  for (const part of parts) {
    output.events.push(...part.events); output.tools.push(...part.tools); output.turns.push(...part.turns);
    output.diagnostics.push(...part.diagnostics); output.timestamps.push(...part.timestamps);
  }
  return output;
}
export function diagnosticCounts(diagnostics: readonly Diagnostic[], category: Diagnostic['category']): Map<string, number> {
  const counts = new Map<string, number>();
  for (const diagnostic of diagnostics) if (diagnostic.category === category)
    counts.set(diagnostic.code, (counts.get(diagnostic.code) ?? 0) + diagnostic.count);
  return counts;
}
