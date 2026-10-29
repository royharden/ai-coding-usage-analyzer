# Evaluation results

not yet run

The analyzer, naive negative control, fixture checks, metamorphic tests and held-out evaluation have not been executed. Source construction, JSON parsing and file hashing are not scores. No model calls.

At activation, `npm run eval` scores dev only and writes this file plus `results.jsonl`, with exact per-field differences, effective fixture options, manifest seed/freeze date/file hashes, manifest SHA-256 and local code commit. The naive sum is an intentionally incorrect negative control and supports token-bucket/known-cost comparisons only; it is not evidence of superiority.

`npm run eval -- --heldout` is explicit. It appends each attempt to `results/heldout-runs.jsonl` and retains an exclusive first-attempt record and immutable first score under the frozen held-out identity. Later attempts are diagnostic only and cannot overwrite that score. A failed initial attempt remains recorded. Dev-only manifest refreshes do not reset the frozen identity. Never tune the analyzer on held-out results.
