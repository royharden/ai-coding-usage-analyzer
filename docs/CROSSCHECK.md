# Supplied external-tool comparison

Nothing here runs or installs another tool. Without `--json`, the script prints `not measured` and reads no files.
After activation, produce an analyzer JSON report and independently run a pinned comparator version over the same
agents, corpus, dates, timezone and pricing policy. Then supply the two files:

```text
npm run crosscheck -- --tool ccusage --tool-version VERSION --json external.json --analyzer report.json
```

Inputs are local UTF-8 JSON files capped at 16 MiB. Output contains only selected numeric fields, comparison status,
the tool/version and interpretation notes. It never copies raw tool records, prompts or command arguments.

The adapters deliberately recognize narrow shapes:

- `ccusage`: the root `totals` object with `inputTokens`, `outputTokens`, `cacheCreationTokens`, `cacheReadTokens`, `totalCost`.
- `ccstats`: top-level period objects, optionally an array, with `input_tokens`, `output_tokens`, `cache_creation_tokens`,
  `cache_creation_1h_tokens`, `cache_read_tokens`, `cost`. Nested model breakdowns are not added again. The 1h count is a
  subset of total creation; 5m is total minus 1h.
- `codeburn`: a top-level call/aggregate, its `totals` object, or an array of calls exposing `inputTokens`, `outputTokens`,
  `cacheCreationInputTokens`, `cacheReadInputTokens`, `costUSD`. Other export layouts remain `not measured`.

These mappings were informed by the provided pinned prior-art notes; current vendor output compatibility has **not
been run or verified**. No upstream code was copied. Missing fields, unsafe integer numbers, invalid values and
fractional pico-USD are unmeasured, never zero. Combined cache creation is compared separately when no TTL split exists.
Decimal strings preserve external values; JSON USD numbers are compared using their decimal rendering, without
repairing upstream floating-point precision. Tool token/reasoning and unknown-price conventions can differ. Agreement
is a diagnostic observation, not a correctness verdict or billing reconciliation.
