# Metrics

Definitions shared verbatim with `src/core/metricDefs.ts`; unit-test source checks this parity. No runtime validation has run.

| Metric id | Label | Definition |
|---|---|---|
| `tokens.input` | Uncached input | Uncached input tokens across all emitted qualities, including unknown-priced events. |
| `tokens.output` | Output | Output tokens across all emitted qualities; Codex reasoning is already inside output. |
| `tokens.cacheRead` | Cache read | Cache-read input tokens across all emitted qualities. |
| `tokens.cacheWrite5m` | Cache write 5m | Five-minute cache-write input tokens, including counted unsplit-write assumptions. |
| `tokens.cacheWrite1h` | Cache write 1h | One-hour cache-write input tokens from explicit cache splits. |
| `cost.known` | Known cost | Exact pico-USD sum of known-priced emitted events; unknown prices are omitted and counted separately. |
| `cost.unknownEvents` | Unknown-price events | Emitted events with no applicable supported price; their tokens remain in token totals. |
| `events.total` | Model calls | Emitted events across verified, observed snapshot and observed epoch qualities; unresolved steps are excluded. |
| `cacheHit` | Cache hit rate | Cache read divided by uncached input plus cache read plus both cache-write buckets, over all emitted qualities; zero denominator is n/a. |
| `turns.claude` | Claude turns | Distinct eligible user UUIDs; meta and tool-result-only rows are excluded. |
| `turns.codex` | Codex turns | Distinct non-replay turn IDs; a context without turn ID counts by its record identity. |
| `tools.total` | Tool calls | Distinct Claude tool-use IDs and non-replay Codex calls; outputs are not extra calls. |
| `claude.errorRate` | Claude tool error rate | Explicit Claude error results divided by explicit error plus success results; unknown statuses are excluded. |
| `claude.errorCoverage` | Claude result coverage | Claude calls with one unambiguous explicit result flag, out of all counted Claude calls. |
| `claude.retries` | Claude retries | Same-name canonical-input repeats immediately after an explicitly failed call whose result precedes the repeat, isolated by session and agent. |
| `retry.ambiguous` | Retry order ambiguous | Claude candidate calls with an equal-timestamp cross-file ordering ambiguity; not counted as retries. |
| `codex.errorRate` | Codex tool error rate | Not available: output text and exit codes are not explicit Codex error flags. |
| `codex.retries` | Codex retries | Not available: Codex lacks the explicit tool-error signal required by the retry definition. |
| `unresolved.total` | Unresolved usage | Filtered unresolved groups and steps; no unique usage event is added to totals. |

Session durations are labelled **within filter** and equal the last recognized timestamp minus the first recognized timestamp in the selected civil-day window. Every grouping uses the report timezone, exact token buckets, known pico-USD, unknown-price event counts, and all emitted qualities. Project paths become deterministic basename labels with collision ordinals by default; full paths require the explicit option.

Retries are reconciled before date filtering and counted at the repeat call timestamp. The previous call is isolated by session and agent. The previous explicit failure result must precede the repeat. Cross-file equal timestamps make ordering ambiguous. Calls with missing input hashes cannot qualify as retries; a nonfinite parsed input number or host hash failure leaves accounting intact while omitting this transient comparison value.

Token completeness and price completeness are independent. Filtered unresolved steps, observed qualities, and import-wide usage-hiding skips make token accounting incomplete. Unknown prices alone do not. Counts of read/recognized lines and file/import diagnostics remain import-wide; they are not selected-window throughput.

Day keys preserve astronomical year `0000`. An accepted RFC3339 timestamp near a year boundary can normalize into a report-zone year outside `0000`–`9999`; product reports use an expanded numeric year and compare/sort civil dates numerically. Edition-one fixture keys are restricted to four-digit years by the frozen scoring schema, so expanded-year behavior has unit-test source coverage only and does not change that schema.
