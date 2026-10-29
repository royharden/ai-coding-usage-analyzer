import type { MetricId } from './metricDefs';
import { formatMetric } from './metrics';
import { recapCheck, RECAP_FAILURE_REASON } from './recapCheck';
import type { CheckedRecap, MetricValue, RecapStatus } from './types';

export type RecapSegment = { kind: 'text'; text: string } | { kind: 'metric'; metricId: MetricId };
/** rule 4.6: all prose is authored here, never derived from log-controlled strings. */
export const recapSegments: readonly RecapSegment[] = [
  { kind: 'text', text: 'Counted ' }, { kind: 'metric', metricId: 'events.total' },
  { kind: 'text', text: ' model calls, with ' }, { kind: 'metric', metricId: 'tokens.input' },
  { kind: 'text', text: ' uncached input tokens and ' }, { kind: 'metric', metricId: 'tokens.output' },
  { kind: 'text', text: ' output tokens. Known cost is ' }, { kind: 'metric', metricId: 'cost.known' },
  { kind: 'text', text: '; unknown-price events: ' }, { kind: 'metric', metricId: 'cost.unknownEvents' },
  { kind: 'text', text: '. Cache hit rate: ' }, { kind: 'metric', metricId: 'cacheHit' },
  { kind: 'text', text: '. Unresolved usage groups or steps: ' }, { kind: 'metric', metricId: 'unresolved.total' },
  { kind: 'text', text: '. Unknown costs are excluded from the known subtotal; unresolved usage is excluded from token totals.' },
];

/** Dates, timezone and imported names belong in a separate report header. */
export function render(segments: readonly RecapSegment[], table: ReadonlyMap<string, MetricValue>): CheckedRecap {
  let text = '';
  const spans: CheckedRecap['spans'] = [];
  for (const segment of segments) {
    if (segment.kind === 'text') {
      if (/[0-9]/.test(segment.text)) throw new Error(RECAP_FAILURE_REASON);
      text += segment.text;
    } else {
      const value = table.get(segment.metricId);
      if (!value) throw new Error(RECAP_FAILURE_REASON);
      const start = text.length;
      text += formatMetric(value);
      spans.push({ start, end: text.length, metricId: segment.metricId });
    }
  }
  return { text, spans };
}

export function checkedRecap(table: ReadonlyMap<string, MetricValue>): { recap?: CheckedRecap; recapStatus: RecapStatus } {
  try {
    const recap = render(recapSegments, table);
    const recapStatus = recapCheck(recap.text, recap.spans, table);
    return recapStatus.ok ? { recap, recapStatus } : { recapStatus };
  } catch { return { recapStatus: { ok: false, reason: RECAP_FAILURE_REASON } }; }
}
