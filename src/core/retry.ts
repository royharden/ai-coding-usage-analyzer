import { DiagnosticBag } from './diagnostics';
import { MetadataBudget } from './limits';
import type { Diagnostic, SourceRef, ToolFact } from './types';
export interface RetryFact { tsMs: number; sourceRef: SourceRef }
export interface RetryAnalysis { retries: RetryFact[]; diagnostics: Diagnostic[] }
type Position = { tsMs: number; sourceRef: SourceRef };
function before(a: Position, b: Position): 'before' | 'not_before' | 'ambiguous' {
  if (a.tsMs < b.tsMs) return 'before';
  if (a.tsMs > b.tsMs) return 'not_before';
  if (a.sourceRef.fileId !== b.sourceRef.fileId) return 'ambiguous';
  return a.sourceRef.line < b.sourceRef.line ? 'before' : 'not_before';
}
/** Hashes are consumed here only. Returned facts and diagnostics contain no hash/name/input. */
// rule I4
// rule 4.5
export function analyzeRetries(tools: readonly ToolFact[], budget = new MetadataBudget()): RetryAnalysis {
  const diagnostics = new DiagnosticBag(budget), retries: RetryFact[] = [];
  const sequences = new Map<string, ToolFact[]>();
  for (const tool of tools) {
    if (tool.agent !== 'claude') continue;
    const key = JSON.stringify([tool.sessionId, tool.agentId ?? 'main']);
    const sequence = sequences.get(key);
    if (!budget.reserve(sequence ? 1 : 2)) { diagnostics.addAll(budget.diagnostic()); continue; }
    if (sequence) sequence.push(tool); else sequences.set(key, [tool]);
  }
  for (const sequence of sequences.values()) {
    sequence.sort((a, b) => a.tsMs - b.tsMs || (a.sourceRef.fileId === b.sourceRef.fileId ? a.sourceRef.line - b.sourceRef.line :
      a.sourceRef.fileId < b.sourceRef.fileId ? -1 : 1));
    let previous: ToolFact | undefined;
    for (let index = 0; index < sequence.length;) {
      const call = sequence[index]; if (!call) break;
      let end = index + 1;
      while (sequence[end]?.tsMs === call.tsMs) end += 1;
      const group = sequence.slice(index, end);
      if (new Set(group.map(item => item.sourceRef.fileId)).size > 1) {
        for (const item of group) diagnostics.add({ category: 'counter', code: 'retry_ambiguous_order', count: 1, tsMs: item.tsMs, sourceRef: item.sourceRef });
        previous = undefined;
      } else for (const current of group) {
        const matching = previous && previous.name === current.name && previous.inputHash !== undefined &&
          current.inputHash !== undefined && previous.inputHash === current.inputHash;
        if (matching && previous?.status === 'error' && previous.resultPosition && before(previous, current) === 'before') {
          const resultOrder = before(previous.resultPosition, current);
          if (resultOrder === 'ambiguous') diagnostics.add({ category: 'counter', code: 'retry_ambiguous_order', count: 1,
            tsMs: current.tsMs, sourceRef: current.sourceRef });
          else if (resultOrder === 'before') {
            if (budget.reserve()) retries.push({ tsMs: current.tsMs, sourceRef: current.sourceRef });
            else diagnostics.addAll(budget.diagnostic());
          }
        }
        previous = current;
      }
      index = end;
    }
  }
  return { retries, diagnostics: diagnostics.values };
}
