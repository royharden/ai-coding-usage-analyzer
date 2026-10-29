import { metricDefs } from './metricDefs';
import { formatMetric } from './metrics';
import type { CheckedRecap, MetricValue, RecapStatus } from './types';

export const RECAP_FAILURE_REASON = 'Recap suppressed because its metric references could not be verified.';

/** A money inequality is one literal, including its sign, space and currency marker. */
export function numericLiterals(text: string): { start: number; end: number }[] {
  return [...text.matchAll(/(?:<\s*\$\d+(?:\.\d+)?|\$\d+(?:\.\d+)?|\d+(?:\.\d+)?%?)/g)]
    .map(match => ({ start: match.index, end: match.index + match[0].length }));
}

/** rule 4.6: verify independently of rendering; never expose candidate text in a failure. */
export function recapCheck(text: string, spans: CheckedRecap['spans'], table: ReadonlyMap<string, MetricValue>): RecapStatus {
  const fail = (): RecapStatus => ({ ok: false, reason: RECAP_FAILURE_REASON });
  if (text.length === 0 || spans.length === 0) return fail();
  const ordered = [...spans].sort((a, b) => a.start - b.start);
  let previousEnd = 0;
  try {
    for (const span of ordered) {
      if (!Number.isSafeInteger(span.start) || !Number.isSafeInteger(span.end) || span.start < previousEnd ||
        span.end <= span.start || span.end > text.length || !Object.hasOwn(metricDefs, span.metricId)) return fail();
      const value = table.get(span.metricId);
      if (!value || text.slice(span.start, span.end) !== formatMetric(value)) return fail();
      previousEnd = span.end;
    }
    // This deliberately re-extracts the displayed text, rather than trusting the recorded spans.
    for (const literal of numericLiterals(text)) {
      if (!ordered.some(span => span.start === literal.start && span.end === literal.end)) return fail();
    }
  } catch { return fail(); }
  return { ok: true };
}
