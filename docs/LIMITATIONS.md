# Accounting and validation limits

## Evidence status

This is statically reviewed source, not an executed or validated release. There are no measured fixture scores,
performance results, browser screenshots or network observations. The narrow target is exact equality on synthetic
fixtures, not billing reconciliation or superiority over ccusage/ccstats/codeburn. See the canonical pending checks in
`DEFERRED-VALIDATION.md` and current `results/results.md`.

## Source interpretation

- Format reconnaissance is one machine/day (2026-10-24), not an official stable log specification. Version drift may
  create skips or unresolved usage. Unknown record kinds are counted, never guessed into billable usage.
- Claude C3b attributes copied identical usage to a deterministic earliest candidate even when session/CWD differ.
  Tokens can be certain while original ownership is not. Attribution conflicts remain counted. Nonterminal snapshots
  are observed quality and make usage incomplete.
- Cache creation without a TTL split is assumed 5m and counted; it does not by itself make usage incomplete. A present
  contradictory split is unresolved. Cache totals and split fields are never both added.
- Codex cached input is inside input and reasoning is inside output. New nonzero `cache_write_input_tokens` deltas are
  unresolved because their relationship to input is unverified (X5b), not silently priced as zero.
- X7/X8/X10 baseline and observed-epoch rules preserve later usable deltas without claiming complete history. Missing
  lineage, resets and ambiguous contexts/ordering have explicit outcomes. Excluded intervals are not measured zero usage.
- Fork replay matching can conservatively undercount a coincidentally matching prefix; it is counted. X1d/I5 removes
  parent tools/turns only when the parent is selected. With the parent absent, copied tool history can count for the child
  and `codex_fork_history_unverified` is visible. Whether a parent's reported totals include spawned subagents remains
  unverified; this is another reason not to treat real-log output as a bill.
- Codex error rate and retries are `not available`: exit codes/text are not substituted for an explicit tool-error flag.
  Claude error coverage excludes unknown flags. Retry means the immediately preceding same-name/canonical-input call
  explicitly failed before the next call, within its session/subagent sequence. It is narrower than edit-based retries.
- Canonical-input/hash failures preserve usage and tool facts but omit the retry hash; those calls cannot prove a retry.
  Retry-input hashes are transient. No raw prompt, reply, argument or retry-input digest is a report field.
  The price-table digest remains report provenance metadata.

## Prices, scope and resources

Production prices are empty. Unknown prices leave tokens intact and make price coverage incomplete independently of
usage completeness. Exact model/effective rows are required; tier, region, speed and long-context conditions can make
cost unknown. Codex aggregate deltas cannot establish every call's context tier. No runtime price fetching exists.

`.zst` archives are diagnosed and skipped, so archived usage can be missing. All filesystem links/junctions are
conservatively skipped. Output confinement and exclusive writes have source tests but Windows behavior has not run.
The 500 MB confirmation/2 GB refusal policy and 1,000,000-entry metadata cap are provisional and unbenchmarked.
Diagnostic evidence is capped; counters remain separate from evidence. Reaching the metadata cap makes the report partial.

Astronomical/expanded-year civil dates have source assertions. Edition-one fixture day keys admit four-digit years only,
so normalization beyond that range is test-only coverage. DST, minimum Node/Intl behavior and all stream/memory edges
still require execution. D24's tiny dev-only cap is explicit and hashed; it is excluded from metamorphic invariance.

## Privacy and recap scope

Reports intentionally retain metadata such as model/tool/session identifiers and project basenames; full logged CWD
requires opt-in. A built local app needs a top-level browser network observation before making a verified post-load
privacy claim. Dev HMR and host/editor-injected traffic are outside that observation. Picker behavior in a Bolt iframe,
worker cancellation and Blob URL cleanup remain unverified.

Recap prose is a fixed template with numeric spans. Serialization rebuilds metrics from current report values and checks
both the canonical template and numeric grounding, suppressing stale/tampered output. Coverage strings with multiple
numeric literals are deliberately not template metrics. This is a deterministic numeric check, not semantic analysis.

External comparison recognizes only the shapes in `CROSSCHECK.md`. Missing/unsafe values stay unmeasured, reported
floating-point precision is not repaired, and output/reasoning/unknown-cost conventions may differ. Logged USD fields
are not accounting ground truth. No external tool has been run during construction.

No live monitoring, forecasts, semantic classification, other harnesses, database, team sync, persistence or optional
`toLedgerRows()` seam is included. All outstanding activation work is listed with exact steps in the deferred ledger.
