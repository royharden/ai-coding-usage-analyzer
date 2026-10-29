import { metricDefs } from './metricDefs';
import { makeMetricTable } from './metrics';
import { checkedRecap } from './recap';
import { recapCheck, RECAP_FAILURE_REASON } from './recapCheck';
import type { Buckets, GroupRow, MetricValue, Report } from './types';

/** Explicit fields, never spread an imported record or a transient event/tool object into output. */
// rule P5
export function serializeBuckets(tokens: Buckets) {
  return { input: tokens.input.toString(), output: tokens.output.toString(), cacheWrite5m: tokens.cacheWrite5m.toString(),
    cacheWrite1h: tokens.cacheWrite1h.toString(), cacheRead: tokens.cacheRead.toString() };
}
function counts<K extends string>(values: ReadonlyMap<K, number>): Record<string, number> {
  // Object.fromEntries creates own properties safely, including __proto__ and constructor.
  return Object.fromEntries([...values].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}
function group(row: GroupRow) {
  return { key: row.key, label: row.label, tokens: serializeBuckets(row.tokens), knownPico: row.knownPico.toString(),
    unknownPriceEvents: row.unknownPriceEvents, events: row.events,
    byQuality: { verified: row.byQuality.verified, observed_snapshot: row.byQuality.observed_snapshot, observed_epoch: row.byQuality.observed_epoch } };
}
function metric(value: MetricValue) {
  switch (value.kind) {
    case 'count': return { kind: value.kind, value: value.value };
    case 'tokens': case 'money': return { kind: value.kind, value: value.value.toString() };
    case 'ratio': return { kind: value.kind, numerator: value.numerator.toString(), denominator: value.denominator.toString() };
    case 'coverage': return { kind: value.kind, known: value.known, total: value.total };
    case 'unavailable': return { kind: value.kind, value: value.value };
  }
}

/** This is also the worker-safe report projection. Retry hashes never enter this boundary. */
// rule 4.7
export function serializeReport(report: Report) {
  // rule 4.6: recheck at the boundary, even if a caller altered the candidate after analyze.
  // The retained table can be stale if an aggregate was changed after analyze.
  // Derive one boundary table from the fields being serialized, then use it everywhere below.
  const currentMetrics = makeMetricTable(report);
  const expected = checkedRecap(currentMetrics).recap;
  const canonical = expected && report.recap && expected.text === report.recap.text &&
    expected.spans.length === report.recap.spans.length && expected.spans.every((span, index) => {
      const candidate = report.recap?.spans[index];
      return candidate?.start === span.start && candidate.end === span.end && candidate.metricId === span.metricId;
    });
  const recapStatus = canonical && report.recap && report.recapStatus?.ok === true
    ? recapCheck(report.recap.text, report.recap.spans, currentMetrics)
    : { ok: false as const, reason: RECAP_FAILURE_REASON };
  const recap = recapStatus.ok && report.recap ? { text: report.recap.text,
    spans: report.recap.spans.map(span => ({ start: span.start, end: span.end, metricId: span.metricId })) } : undefined;
  const result = {
    schema: report.schema,
    metadata: { tz: report.metadata.tz, since: report.metadata.since, until: report.metadata.until,
      priceTableDigest: report.metadata.priceTableDigest, priceTableSchema: report.metadata.priceTableSchema,
      parserSchema: report.metadata.parserSchema, fullPaths: report.metadata.fullPaths,
      bytesRead: report.metadata.bytesRead, filesRead: report.metadata.filesRead },
    complete: report.complete, tokens: serializeBuckets(report.tokens),
    tokensByQuality: { verified: serializeBuckets(report.tokensByQuality.verified),
      observed_snapshot: serializeBuckets(report.tokensByQuality.observed_snapshot), observed_epoch: serializeBuckets(report.tokensByQuality.observed_epoch) },
    cost: { knownPico: report.cost.knownPico.toString(), knownByQuality: {
      verified: report.cost.knownByQuality.verified.toString(), observed_snapshot: report.cost.knownByQuality.observed_snapshot.toString(),
      observed_epoch: report.cost.knownByQuality.observed_epoch.toString() }, unknownPriceTokens: serializeBuckets(report.cost.unknownPriceTokens),
      unknownPriceEvents: { total: report.cost.unknownPriceEvents.total, byReason: counts(report.cost.unknownPriceEvents.byReason),
        byModel: counts(report.cost.unknownPriceEvents.byModel) }, complete: report.cost.complete },
    cacheHit: { numerator: report.cacheHit.numerator.toString(), denominator: report.cacheHit.denominator.toString(), display: report.cacheHit.display },
    events: { total: report.events.total, byQuality: { verified: report.events.byQuality.verified,
      observed_snapshot: report.events.byQuality.observed_snapshot, observed_epoch: report.events.byQuality.observed_epoch },
      byAgent: { claude: report.events.byAgent.claude, codex: report.events.byAgent.codex } },
    modelCalls: report.modelCalls, turns: { claude: report.turns.claude, codex: report.turns.codex },
    tools: { total: report.tools.total, byName: counts(report.tools.byName), byMcpServer: counts(report.tools.byMcpServer) },
    toolResults: { error: report.toolResults.error, ok: report.toolResults.ok, unknown: report.toolResults.unknown },
    retries: report.retries, retryAmbiguous: report.retryAmbiguous,
    errorRate: { claude: { numerator: report.errorRate.claude.numerator, denominator: report.errorRate.claude.denominator,
      display: report.errorRate.claude.display, coverage: report.errorRate.claude.coverage }, codex: report.errorRate.codex },
    codexRetries: report.codexRetries,
    sessionDurations: report.sessionDurations.map(row => ({ agent: row.agent, sessionId: row.sessionId,
      firstMs: row.firstMs, lastMs: row.lastMs, durationMs: row.durationMs, label: row.label })),
    groupings: { day: report.groupings.day.map(group), project: report.groupings.project.map(group),
      session: report.groupings.session.map(group), model: report.groupings.model.map(group), agent: report.groupings.agent.map(group) },
    skipped: counts(report.skipped), unresolved: counts(report.unresolved), counters: counts(report.counters),
    evidence: report.evidence.map(item => ({ category: item.category, code: item.code,
      sourceRef: { fileId: item.sourceRef.fileId, line: item.sourceRef.line } })),
    metricTable: Object.fromEntries(Object.keys(metricDefs).flatMap(id => {
      const value = currentMetrics.get(id); return value ? [[id, metric(value)]] : [];
    })),
    recapStatus,
    ...(recap ? { recap } : {}),
  };
  return result;
}
export type SerializedReport = ReturnType<typeof serializeReport>;

/** Exact population seam for M4, independent from fixture identity/traps/price-file inputs. */
export function toFixturePopulations(report: Report) {
  const safe = serializeReport(report);
  return {
    tz: safe.metadata.tz, since: safe.metadata.since, until: safe.metadata.until,
    tokens: safe.tokens, tokensByQuality: safe.tokensByQuality,
    cost: { knownPico: safe.cost.knownPico, unknownPriceTokens: safe.cost.unknownPriceTokens,
      unknownPriceEvents: safe.cost.unknownPriceEvents, complete: safe.cost.complete },
    cacheHit: { numerator: safe.cacheHit.numerator, denominator: safe.cacheHit.denominator },
    events: safe.events, modelCalls: safe.modelCalls, turns: safe.turns, tools: safe.tools, toolResults: safe.toolResults,
    retries: safe.retries, retryAmbiguous: safe.retryAmbiguous, unresolved: safe.unresolved, skipped: safe.skipped, counters: safe.counters,
    byDay: Object.fromEntries(safe.groupings.day.map(row => [row.key, { tokens: row.tokens, knownPico: row.knownPico, events: row.events }])),
    complete: safe.complete,
  };
}
