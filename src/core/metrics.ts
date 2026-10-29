import { DiagnosticBag } from './diagnostics';
import { MetadataBudget } from './limits';
import { formatUsd } from './money';
import type { AgentCounts, Diagnostic, MetricValue, RecognisedTimestamp, Report, SessionDuration, ToolFact, TurnFact } from './types';

// rule I7: multiply first, then round once, all in exact integer arithmetic.
export function formatPercent(numerator: bigint, denominator: bigint): string {
  if (numerator < 0n || denominator < 0n) throw new Error('Negative ratio');
  if (denominator === 0n) return 'n/a';
  const tenths = (numerator * 1000n + denominator / 2n) / denominator;
  return `${tenths / 10n}.${tenths % 10n}%`;
}
export function formatMetric(value: MetricValue): string {
  switch (value.kind) {
    case 'count': case 'tokens': return value.value.toString();
    case 'money': return formatUsd(value.value);
    case 'ratio': return formatPercent(value.numerator, value.denominator);
    case 'coverage': return `${value.known} of ${value.total}`;
    case 'unavailable': return value.value;
  }
}
export interface BehavioralMetrics {
  turns: AgentCounts; tools: Report['tools']; toolResults: Report['toolResults']; errorRate: Report['errorRate'];
  sessionDurations: SessionDuration[]; diagnostics: Diagnostic[];
}
/** All inputs already use I3 attribution and I6 filtering. No raw input or hashes are read here. */
export function behavioralMetrics(tools: readonly ToolFact[], turns: readonly TurnFact[], timestamps: readonly RecognisedTimestamp[],
  budget = new MetadataBudget()): BehavioralMetrics {
  const diagnostics = new DiagnosticBag(budget);
  const output: BehavioralMetrics = { turns: { claude: 0, codex: 0 }, tools: { total: 0, byName: new Map(), byMcpServer: new Map() },
    toolResults: { error: 0, ok: 0, unknown: 0 }, errorRate: { claude: { numerator: 0, denominator: 0, display: 'n/a', coverage: '0 of 0' }, codex: 'not available' },
    sessionDurations: [], diagnostics: diagnostics.values };
  for (const turn of turns) output.turns[turn.agent] += 1;
  // rule 4.5: MCP server grouping is a subset of tool counts, never added again to total.
  for (const tool of tools) {
    const mcp = /^mcp__(.+?)__(.+)$/.exec(tool.name), server = mcp?.[1];
    const needed = (output.tools.byName.has(tool.name) ? 0 : 1) + (server && !output.tools.byMcpServer.has(server) ? 1 : 0);
    if (!budget.reserve(needed)) { diagnostics.addAll(budget.diagnostic()); continue; }
    output.tools.total += 1; output.tools.byName.set(tool.name, (output.tools.byName.get(tool.name) ?? 0) + 1);
    if (server) output.tools.byMcpServer.set(server, (output.tools.byMcpServer.get(server) ?? 0) + 1);
    if (tool.agent === 'claude') output.toolResults[tool.status] += 1;
  }
  const known = output.toolResults.error + output.toolResults.ok;
  const total = known + output.toolResults.unknown;
  output.errorRate.claude = { numerator: output.toolResults.error, denominator: known,
    display: formatPercent(BigInt(output.toolResults.error), BigInt(known)), coverage: `${known} of ${total}` };
  // rule I6: duration is last-first among recognized timestamps WITHIN the window.
  const sessions = new Map<string, SessionDuration>();
  for (const timestamp of timestamps) {
    const key = JSON.stringify([timestamp.agent, timestamp.sessionId]);
    const existing = sessions.get(key);
    if (existing) {
      existing.firstMs = Math.min(existing.firstMs, timestamp.tsMs); existing.lastMs = Math.max(existing.lastMs, timestamp.tsMs);
      existing.durationMs = existing.lastMs - existing.firstMs;
    } else if (budget.reserve()) sessions.set(key, { agent: timestamp.agent, sessionId: timestamp.sessionId,
      firstMs: timestamp.tsMs, lastMs: timestamp.tsMs, durationMs: 0, label: 'within filter' });
    else diagnostics.addAll(budget.diagnostic());
  }
  output.sessionDurations = [...sessions.values()].sort((a, b) => a.agent < b.agent ? -1 : a.agent > b.agent ? 1 :
    a.sessionId < b.sessionId ? -1 : a.sessionId > b.sessionId ? 1 : 0);
  return output;
}
export function makeMetricTable(report: Report): Map<string, MetricValue> {
  const values = new Map<string, MetricValue>();
  for (const name of ['input', 'output', 'cacheRead', 'cacheWrite5m', 'cacheWrite1h'] as const)
    values.set(`tokens.${name}`, { kind: 'tokens', value: report.tokens[name] });
  values.set('cost.known', { kind: 'money', value: report.cost.knownPico });
  values.set('cost.unknownEvents', { kind: 'count', value: report.cost.unknownPriceEvents.total });
  values.set('events.total', { kind: 'count', value: report.modelCalls });
  values.set('cacheHit', { kind: 'ratio', numerator: report.cacheHit.numerator, denominator: report.cacheHit.denominator });
  values.set('turns.claude', { kind: 'count', value: report.turns.claude }); values.set('turns.codex', { kind: 'count', value: report.turns.codex });
  values.set('tools.total', { kind: 'count', value: report.tools.total });
  values.set('claude.errorRate', { kind: 'ratio', numerator: BigInt(report.toolResults.error), denominator: BigInt(report.toolResults.error + report.toolResults.ok) });
  values.set('claude.errorCoverage', { kind: 'coverage', known: report.toolResults.error + report.toolResults.ok,
    total: report.toolResults.error + report.toolResults.ok + report.toolResults.unknown });
  values.set('claude.retries', { kind: 'count', value: report.retries }); values.set('retry.ambiguous', { kind: 'count', value: report.retryAmbiguous });
  values.set('codex.errorRate', { kind: 'unavailable', value: 'not available' }); values.set('codex.retries', { kind: 'unavailable', value: 'not available' });
  values.set('unresolved.total', { kind: 'count', value: [...report.unresolved.values()].reduce((sum, count) => sum + count, 0) });
  return values;
}
