# Trap and rule coverage

Edition 1. D01-D24 are authored synthetic dev fixtures with hand-computed answers. The table below is derived from their actual `expected.json` trap tags; tags and source assertions establish construction coverage, not execution or a passing score. H01-H10 coverage below is M0's recorded frozen metadata; M4 coders have not read `fixtures/heldout/**`.

Every accounting fixture is scored on all `s22-expected/1` populations. A trap tag does not establish export safety, display rounding, invalid-price rejection or other direct-test behavior; those require the concrete test sources listed below. No analyzer, baseline, test, demo or build has run.

| Trap | Rules | M0 held-out record / observable family | Actual dev fixture tags |
|---|---|---|---|
| cache-buckets | C1,P5 | H01 tokens W5/W1/R; cost | D01, D11 |
| reasoning-inside-output | X5 | H01 output, cost (reasoning never added) | D02 |
| cumulative-delta | X4,X5 | H01 tokens, events, cost | D02 |
| stream-terminal | C2,C3,I2 | H02 tokens, duplicate_rows | D03 |
| stream-identical | C2,C3,I2 | H02 tokens, duplicate_rows | D03 |
| same-message-two-files | C2,C3b | H02 duplicate_rows; tokens counted once | D04, D20, D21 |
| sidechain-once | C4 | H02 tokens; H09 tools/retry sequence | D04, D20 |
| nonterminal-snapshot | C3(a) | H02 tokensByQuality, complete | D05 |
| conflicting-duplicates | C3,I2 | H02 unresolved, duplicate_rows | D05, D07, D17 |
| missing-request-merge | C2,I2 | H02 missing/merged counters, request_id_conflict | D06, D07 |
| missing-request-conflict | C2,I2 | H02 missing/merged counters, request_id_conflict | D06 |
| attribution-copy | C3b,I3 | H02 attribution_conflict and tokens | D04 |
| cache-split-mismatch | C1,I2 | H03 unresolved, assumed5m, tokens | D07 |
| assumed-5m | C1,I2 | H03 unresolved, assumed5m, tokens | D07 |
| synthetic-error | C5 | H03 skip3, synthetic_nonzero_usage1, API-error nonzero tokens | D08 |
| missing-identity | C2,I1 | H03 no_identity | D06 |
| bad-count | N1,I1 | H03/H10 skips, rowsRecognised | D08 |
| bad-timestamp | N1,I1 | H03/H10 skips, rowsRecognised | D08 |
| civil-day | 4.5,I6 | H03 byDay Kolkata 23:59:59/00:00:01; H05 New York | D11, D12, D20 |
| price-change | P1,P2 | H04 dated cost at exact midday switch | D14 |
| unknown-model | X3,P2 | H04/H08 cost unknown maps and retained tokens | D09, D10, D21 |
| unsupported-modifier | P4 | H04 tier_unsupported, H08 ambiguous tier | D09 |
| long-context | P2,P4 | H04 unknown reason maps, unknown tokens | D10 |
| missing-rate | P2,P4 | H04 unknown reason maps, unknown tokens | D10 |
| unknown-price-precedence | P2,P4 | H04 unknown reason maps, unknown tokens | D09, D10 |
| inclusive-filter | X4,I6,4.5 | H05 selected deltas/byDay; out-of-window faults excluded; complete=true | D12, D13 |
| pre-window-baseline | X4,I6,4.5 | H05 selected deltas/byDay; out-of-window faults excluded; complete=true | D13 |
| filtered-diagnostics | X4,I6,4.5 | H05 selected deltas/byDay; out-of-window faults excluded; complete=true | D13 |
| out-of-order | X2,C3 | H06/H10 totals and events independent of physical order | D02 |
| split-session | X1 | H06 duplicate_copy1 and single-session deltas | D02 |
| duplicate-copy | X1 | H06 duplicate_copy1 and single-session deltas | D02 |
| repeated-total | X4,X6,X10 | H06 repeat1/mismatch1; repeated last ignored | D02 |
| last-delta-mismatch | X4,X6,X10 | H06 repeat1/mismatch1; repeated last ignored | D02 |
| regression-epoch | X5,X7,X10 | H06 unresolved and observed_epoch | D10 |
| cached-exceeds-input | X5,X7,X10 | H06 unresolved and observed_epoch | D10 |
| fork-prefix | X8,X10 | H07 replay_dropped2, four verified events | D10 |
| embedded-parent-meta | X1b | H07 counter2; H08 counter1 | D10 |
| fork-tool-turn-replay | X1d,I5,X9 | H07 replay tool/turn4 each, turns4/tools2 | D15 |
| fork-zero-start | X8,X10 | H07 replay_dropped2, four verified events | D10 |
| fork-unproven | X8(d),X10 | H08 unresolved, observed_epoch, reset3 | D10 |
| missing-session-meta | X8(d),X10 | H08 unresolved, observed_epoch, reset3 | D10 |
| ambiguous-tier | P4,X2,X10 | H08 tier_unsupported, no invented base cost | D09 |
| cache-write-unmodeled | X5b,X5,X10 | H08 unresolved, later exact-baseline deltas | D10 |
| reasoning-exceeds-output | X5b,X5,X10 | H08 unresolved, later exact-baseline deltas | D10 |
| incomparable-tie | X2,X3,X10 | H08 unresolved once per tied set/step | D10 |
| ambiguous-context | X2,X3,X10 | H08 unresolved once per tied set/step | D10 |
| tools-mcp | C6,X9,I4,I5,4.5 | H09 tools by name/server, result counts; H06 Codex tools | D15 |
| explicit-error | C6,X9,I4,I5,4.5 | H09 tools by name/server, result counts; H06 Codex tools | D15 |
| canonical-retry | 4.5,I4 | H09 retries2, successes do not create retry | D13, D16, D17, D18 |
| no-retry-after-success | 4.5,I4 | H09 retries2, successes do not create retry | D16 |
| subagent-retry-isolation | C4,I4 | H09 main retry survives sidechain interleaving | D16 |
| status-conflict | C6,I4 | H09 conflict/orphan1 each; results unknown | D17 |
| orphan-result | C6,I4 | H09 conflict/orphan1 each; results unknown | D17 |
| turn-meta-exclusion | C7,I4 | H09 turns4, missing1 (meta/tool results excluded) | D17 |
| missing-turn-identity | C7,I4 | H09 turns4, missing1 (meta/tool results excluded) | D17 |
| hostile-strings | 4.7 | H09 prototype/cwd rows remain in scored tokens/tools; direct safety assertions also required | D21 |
| bom | L1 | H10 rowsRecognised and token totals show first-line BOM stripped; stripping adds no counter | D22 |
| blank-line | L1,L4 | H10 skip map, rowsRecognised; later valid usage survives | D22 |
| malformed-line | L1,L4 | H10 skip map, rowsRecognised; later valid usage survives | D22 |
| truncated-final | L1,L4 | H10 skip map, rowsRecognised; later valid usage survives | D22 |
| empty-file | L5,intake | H10 corresponding file skip counts, complete | D22 |
| non-jsonl | L5,intake | H10 corresponding file skip counts, complete | D22 |
| compressed-unsupported | L5,intake | H10 corresponding file skip counts, complete | D22 |
| unidentified-session | X1,I1 | H10 file skip, line-level malformed, rowsRecognised | D22 |
| empty-token-count | I1 | H08 empty counter1, rowsRecognised31 | D08 |
| very-long-line | L2 | Not planted held-out; stream cap needs sized dev data | D23 |
| invalid-utf8 | L3 | Not planted held-out; binary byte trap assigned to dev | D23 |
| model-conflict | C3,I2 | Not planted held-out; highest group-reason precedence | D05 |
| inherited-start | X8(b)/(d) | Not planted held-out; meta present but differing last | D10 |
| timestamp-context-switch | X2,X10.7 | Not planted held-out; switch exactly at usage timestamp | D10 |
| field-limit | N1 | Not planted held-out; >4096 code-point identity rejected | D23 |
| metadata-cap | 4.7 | Not planted held-out; configurable tiny-cap dev fixture | D24 |
| cache-hit-rounding | I7,P5 | Raw exact fractions/costs in every H answer; direct formatting assertions still needed | D19 |
| money-rounding | I7,P5 | Raw exact fractions/costs in every H answer; direct formatting assertions still needed | D19 |
| safe-exports | 4.7,I7 | H09 planted hostile data; CSV/Markdown/basename assertions in dev | Direct contract only; see below |
| dst | 4.5,I6 | Not planted held-out; civil-day DST boundaries | D12 |
| price-validation | P1,P3,P6 | Synthetic rows have source/date, missing optional rate; invalid rows dev only | Direct contract only; see below |
| missing-fields | I1 | H03 default absent cache split; H08 absent last/zero default buckets | D08 |
| retry-ambiguous-order | I4,4.5 | Not planted held-out; equal-time cross-file tie | D18 |

`safe-exports` and `price-validation` are direct test contracts, not dev fixture-scored tags. This is deliberate: a valid price-table fixture cannot demonstrate rejection of invalid tables, and token totals cannot demonstrate CSV/Markdown/UI escaping. `cache-hit-rounding` and `money-rounding` in D19 provide exact raw fractions/pico-USD; their rendered rounding remains a direct test contract. D21 hostile values are scored for accounting preservation and require the direct safety contracts too.

| Direct contract | Existing source assertions (unexecuted) |
|---|---|
| safe-exports, hostile strings | `tests/core/exports.test.ts`, `tests/core/exportsFormats.test.ts`, `tests/web/App.test.tsx`, `tests/static/forbiddenApis.test.ts` |
| price-validation | `tests/core/prices.test.ts` (P1/P3 invalid header, rates, duplicate effective dates and dates; P6 empty table) |
| cache-hit-rounding | `tests/core/metrics.test.ts` (I7 half-up and zero denominator) |
| money-rounding | `tests/core/money.test.ts` (P5 integer pico rounding and small costs) |
| recap grammar/span correctness (4.6) | `tests/core/recap.test.ts`, `tests/core/recapCli.test.ts` |
| CLI flags/guards (4.10), output confinement | `tests/cli/args.test.ts`, `tests/cli/walk.test.ts`, `tests/cli/outGuard.test.ts`, `tests/cli/sizeBudget.test.ts` |
| very-long-line, invalid-utf8, field-limit | D23's actual >8 MiB/FF/4,097-code-point lines and 4,096-code-point admitted boundary; `tests/core/lines.test.ts`, `tests/core/claude.test.ts` |
| metadata-cap | D24 uses a strict dev-only `analysis-options.json` with cap 0; `docs/FIXTURE-OPTIONS.md`, `tests/core/analyze.test.ts`, `tests/eval/manifest.test.ts` |
| four metamorphic transforms | `tests/eval/metamorphic.test.ts`: reverse line order, split file, byte copy, one added malformed line on 17 suitable full dev fixtures plus a declared stable D17 subset for orphan/status-conflict counters; tied retry D18 is diagnostic-only, capped D24 excluded |

| Rule family | Authored fixture or direct source coverage |
|---|---|
| L1-L5, intake | D22,D23; `tests/core/lines.test.ts`, `tests/cli/walk.test.ts` |
| N1 | D08,D23; `tests/core/claude.test.ts`, `tests/core/codex.test.ts` |
| C1-C3,C3b | D01,D03-D07,D20; `tests/core/claude.test.ts`, `tests/core/reconcile.test.ts` |
| C4-C7 | D04,D08,D15-D17,D20; `tests/core/claude.test.ts`, `tests/core/reconcile.test.ts`, `tests/core/metrics.test.ts` |
| X1,X1b,X1c,X1d | D02,D08,D10,D15,D22; `tests/core/codex.test.ts` |
| X2-X10,X5b | D02,D09,D10,D13,D15; `tests/core/codex.test.ts`, `tests/core/reconcile.test.ts` |
| P1-P4,P6 | D09,D10,D14; invalid-table/empty-table contracts in `tests/core/prices.test.ts`; production table provenance remains deferred |
| P5 | D01,D14,D19; `tests/core/money.test.ts`, `tests/core/exports.test.ts` |
| I1-I3 | D02,D04-D10,D20,D22,D23; `tests/core/analyze.test.ts`, parser/reconciliation sources above |
| I4-I5 | D13,D15-D18; `tests/core/retry.test.ts`, `tests/core/metrics.test.ts`, `tests/core/codex.test.ts` |
| I6 | D11-D14,D20; `tests/core/time.test.ts`, `tests/core/analyze.test.ts` |
| I7,4.5 | Exact fractions/events in every fixture; D11-D20; `tests/core/metrics.test.ts`, `tests/core/aggregate.test.ts` |
| 4.6,4.7,4.10 | Direct contracts above; D21-D24 accounting/intake populations; browser/static/CLI assertion sources |

The checker validates the closed shape, internal population sums, dev input-file inventory/hashes, encoding exception declarations, secret-shaped text and the declared trap/direct-test inventory. It does not independently re-derive trap arithmetic or prove assertion quality. Independent worksheet review, runnable checks, every negative-control difference, export safety, memory bounds and explicit held-out scoring remain deferred. Unknown reason keys fail even at zero; missing sparse reason/name entries mean zero.
