/** Single source of truth for UI tooltips and docs/METRICS.md. */
export const metricDefs = {
  'tokens.input': { label: 'Uncached input', definition: 'Uncached input tokens across all emitted qualities, including unknown-priced events.' },
  'tokens.output': { label: 'Output', definition: 'Output tokens across all emitted qualities; Codex reasoning is already inside output.' },
  'tokens.cacheRead': { label: 'Cache read', definition: 'Cache-read input tokens across all emitted qualities.' },
  'tokens.cacheWrite5m': { label: 'Cache write 5m', definition: 'Five-minute cache-write input tokens, including counted unsplit-write assumptions.' },
  'tokens.cacheWrite1h': { label: 'Cache write 1h', definition: 'One-hour cache-write input tokens from explicit cache splits.' },
  'cost.known': { label: 'Known cost', definition: 'Exact pico-USD sum of known-priced emitted events; unknown prices are omitted and counted separately.' },
  'cost.unknownEvents': { label: 'Unknown-price events', definition: 'Emitted events with no applicable supported price; their tokens remain in token totals.' },
  'events.total': { label: 'Model calls', definition: 'Emitted events across verified, observed snapshot and observed epoch qualities; unresolved steps are excluded.' },
  'cacheHit': { label: 'Cache hit rate', definition: 'Cache read divided by uncached input plus cache read plus both cache-write buckets, over all emitted qualities; zero denominator is n/a.' },
  'turns.claude': { label: 'Claude turns', definition: 'Distinct eligible user UUIDs; meta and tool-result-only rows are excluded.' },
  'turns.codex': { label: 'Codex turns', definition: 'Distinct non-replay turn IDs; a context without turn ID counts by its record identity.' },
  'tools.total': { label: 'Tool calls', definition: 'Distinct Claude tool-use IDs and non-replay Codex calls; outputs are not extra calls.' },
  'claude.errorRate': { label: 'Claude tool error rate', definition: 'Explicit Claude error results divided by explicit error plus success results; unknown statuses are excluded.' },
  'claude.errorCoverage': { label: 'Claude result coverage', definition: 'Claude calls with one unambiguous explicit result flag, out of all counted Claude calls.' },
  'claude.retries': { label: 'Claude retries', definition: 'Same-name canonical-input repeats immediately after an explicitly failed call whose result precedes the repeat, isolated by session and agent.' },
  'retry.ambiguous': { label: 'Retry order ambiguous', definition: 'Claude candidate calls with an equal-timestamp cross-file ordering ambiguity; not counted as retries.' },
  'codex.errorRate': { label: 'Codex tool error rate', definition: 'Not available: output text and exit codes are not explicit Codex error flags.' },
  'codex.retries': { label: 'Codex retries', definition: 'Not available: Codex lacks the explicit tool-error signal required by the retry definition.' },
  'unresolved.total': { label: 'Unresolved usage', definition: 'Filtered unresolved groups and steps; no unique usage event is added to totals.' },
} as const;
export type MetricId = keyof typeof metricDefs;
