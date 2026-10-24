# Dev fixture analysis options

D24 represents the already specified TRAPS `metadata-cap` requirement with a tiny configurable cap, using the existing core `AnalyzeOptions.metadataCap`. This is a new representation of an existing requirement, approved by S22-INT during M4 construction on 2026-10-24; it is not a rule or expected-schema change. A million-row default-cap fixture would inflate the corpus without making its hand-computed answer clearer.

The optional file is `<dev fixture>/analysis-options.json`:

```json
{"schema":"s22-analysis-options/1","metadataCap":0}
```

The object is closed: exactly `schema` and `metadataCap`, schema literal as above, cap a nonnegative safe integer no greater than the ordinary 1,000,000-entry cap. Missing sidecar means the ordinary cap. Unknown keys, a missing cap, fractions, negatives and excessive caps fail loading. This harness input is outside `s22-expected/1`; its SHA-256 is recorded among dev input hashes and its effective cap is included in each analyzer row. Negative-control rows explicitly say the naive sum does not apply the metadata cap/sidecar and also record the analyzer's effective options. It is never passed as a log to the analyzer.

Edition-one held-out fixtures forbid sidecars. Their input representation, frozen expected answers, contracts, prices and hashes remain unchanged. Default fixture checking, freezing, tests and evaluation operate on dev only. `freeze-fixtures` refuses every argument, including `--heldout`; changing a frozen corpus requires an independently authored new edition rather than refreezing this one.

D24's cap 0 refuses the first retained source identity and later parsed-row reservation. The single valid row is still read and recognised, so both row counters are 1. The cap diagnostic occurs once, no usage/tool/turn facts survive, tokens/events/cost subtotal are zero, `byDay` is empty, token accounting is incomplete and price coverage is complete over the empty emitted population. This expected answer was manually derived from source by the independent fixture author; no application was run.

The `metadata-cap` case is excluded from metamorphic invariance: extra source identities or row order can change which data survives a cap. Source tests in `tests/eval/manifest.test.ts` cover sidecar rejection and held-out refusal. Their execution, dev scoring and default-cap memory behavior remain deferred.
