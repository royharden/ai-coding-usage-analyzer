import { makeMetricTable } from '../../src/core/metrics';
import { checkedRecap } from '../../src/core/recap';
import { serializeReport } from '../../src/core/serialize';
import { zeroBuckets } from '../../src/core/types';
import type { Report } from '../../src/core/types';

/** Synthetic aggregate only: no local transcript or fixture bundle is imported into the UI. */
export function coreReport(): Report {
  const quality = { verified: 1, observed_snapshot: 0, observed_epoch: 0 };
  const tokens = { ...zeroBuckets(), input: 12n, output: 3n };
  const row = { key: 'synthetic', label: 'synthetic', tokens, knownPico: 27n, unknownPriceEvents: 0, events: 1, byQuality: quality };
  const value: Report = {
    schema: 's22-report/1', metadata: { tz: 'UTC', since: null, until: null, priceTableDigest: 'a'.repeat(64),
      priceTableSchema: 'pricetable/1', parserSchema: 's22-parser/1', fullPaths: false, bytesRead: 100, filesRead: 1 },
    complete: true, tokens, tokensByQuality: { verified: tokens, observed_snapshot: zeroBuckets(), observed_epoch: zeroBuckets() },
    cost: { knownPico: 27n, knownByQuality: { verified: 27n, observed_snapshot: 0n, observed_epoch: 0n },
      unknownPriceTokens: zeroBuckets(), unknownPriceEvents: { total: 0, byReason: new Map(), byModel: new Map() }, complete: true },
    cacheHit: { numerator: 0n, denominator: 12n, display: '0.00%' }, events: { total: 1, byQuality: quality, byAgent: { claude: 1, codex: 0 } },
    modelCalls: 1, turns: { claude: 1, codex: 0 }, tools: { total: 0, byName: new Map(), byMcpServer: new Map() },
    toolResults: { error: 0, ok: 0, unknown: 0 }, retries: 0, retryAmbiguous: 0,
    errorRate: { claude: { numerator: 0, denominator: 0, display: 'n/a', coverage: '0/0' }, codex: 'not available' },
    codexRetries: 'not available', sessionDurations: [],
    groupings: { day: [{ ...row, key: '2026-10-24', label: '2026-10-24' }], project: [row], session: [row], model: [row], agent: [row] },
    skipped: new Map(), unresolved: new Map(), counters: new Map([['rowsRead', 1]]), evidence: [], metricTable: new Map(),
    recapStatus: { ok: false, reason: 'Recap suppressed because its metric references could not be verified.' },
  };
  value.metricTable = makeMetricTable(value);
  Object.assign(value, checkedRecap(value.metricTable));
  return value;
}
export function uiReport() { return serializeReport(coreReport()); }
