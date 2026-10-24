# Trap and rule coverage

Edition 1. H01-H10 exist and their hand-computed answers are frozen by M0. D01-D24 below are **planned dev** ids,
not claims of existing files, tests, execution or full M4 coverage. Every accounting trap below changes a scored field.
M3 safety assertions additionally inspect serializers/UI behavior. No runtime score exists.

| Trap name(s) | Rule(s) | Held-out coverage / observable field | Planned dev |
|---|---|---|---|
| cache-buckets | C1,P5 | H01 tokens W5/W1/R; cost | D01 |
| reasoning-inside-output | X5 | H01 output, cost (reasoning never added) | D02 |
| cumulative-delta | X4,X5 | H01 tokens, events, cost | D02 |
| stream-terminal, stream-identical | C2,C3,I2 | H02 tokens, duplicate_rows | D03 |
| same-message-two-files | C2,C3b | H02 duplicate_rows; tokens counted once | D04 |
| sidechain-once | C4 | H02 tokens; H09 tools/retry sequence | D04 |
| nonterminal-snapshot | C3(a) | H02 tokensByQuality, complete | D05 |
| conflicting-duplicates | C3,I2 | H02 unresolved, duplicate_rows | D05 |
| missing-request-merge, missing-request-conflict | C2,I2 | H02 missing/merged counters, request_id_conflict | D06 |
| attribution-copy | C3b,I3 | H02 attribution_conflict and tokens | D04 |
| cache-split-mismatch, assumed-5m | C1,I2 | H03 unresolved, assumed5m, tokens | D07 |
| synthetic-error | C5 | H03 skip3, synthetic_nonzero_usage1, API-error nonzero tokens | D08 |
| missing-identity | C2,I1 | H03 no_identity | D06 |
| bad-count, bad-timestamp | N1,I1 | H03/H10 skips, rowsRecognised | D08 |
| civil-day | 4.5,I6 | H03 byDay Kolkata 23:59:59/00:00:01; H05 New York | D11 |
| price-change | P1,P2 | H04 dated cost at exact midday switch | D14 |
| unknown-model | X3,P2 | H04/H08 cost unknown maps and retained tokens | D09 |
| unsupported-modifier | P4 | H04 tier_unsupported, H08 ambiguous tier | D09 |
| long-context, missing-rate, unknown-price-precedence | P2,P4 | H04 unknown reason maps, unknown tokens | D10 |
| inclusive-filter, pre-window-baseline, filtered-diagnostics | X4,I6,4.5 | H05 selected deltas/byDay; out-of-window faults excluded; complete=true | D13 |
| out-of-order | X2,C3 | H06/H10 totals and events independent of physical order | D02 |
| split-session, duplicate-copy | X1 | H06 duplicate_copy1 and single-session deltas | D02 |
| repeated-total, last-delta-mismatch | X4,X6,X10 | H06 repeat1/mismatch1; repeated last ignored | D02 |
| regression-epoch, cached-exceeds-input | X5,X7,X10 | H06 unresolved and observed_epoch | D10 |
| fork-prefix, fork-zero-start | X8,X10 | H07 replay_dropped2, four verified events | D10 |
| embedded-parent-meta | X1b | H07 counter2; H08 counter1 | D10 |
| fork-tool-turn-replay | X1d,I5,X9 | H07 replay tool/turn4 each, turns4/tools2 | D15 |
| fork-unproven, missing-session-meta | X8(d),X10 | H08 unresolved, observed_epoch, reset3 | D10 |
| ambiguous-tier | P4,X2,X10 | H08 tier_unsupported, no invented base cost | D09 |
| cache-write-unmodeled, reasoning-exceeds-output | X5b,X5,X10 | H08 unresolved, later exact-baseline deltas | D10 |
| incomparable-tie, ambiguous-context | X2,X3,X10 | H08 unresolved once per tied set/step | D10 |
| empty-token-count | I1 | H08 empty counter1, rowsRecognised31 | D08 |
| tools-mcp, explicit-error | C6,X9,I4,I5,4.5 | H09 tools by name/server, result counts; H06 Codex tools | D15 |
| canonical-retry, no-retry-after-success | 4.5,I4 | H09 retries2, successes do not create retry | D16 |
| subagent-retry-isolation | C4,I4 | H09 main retry survives sidechain interleaving | D16 |
| status-conflict, orphan-result | C6,I4 | H09 conflict/orphan1 each; results unknown | D17 |
| turn-meta-exclusion, missing-turn-identity | C7,I4 | H09 turns4, missing1 (meta/tool results excluded) | D17 |
| hostile-strings | 4.7 | H09 prototype/cwd rows remain in scored tokens/tools; direct safety assertions also required | D21 |
| bom | L1 | H10 rowsRecognised and token totals show first-line BOM stripped; stripping adds no counter | D22 |
| blank-line, malformed-line, truncated-final | L1,L4 | H10 skip map, rowsRecognised; later valid usage survives | D22 |
| empty-file, non-jsonl, compressed-unsupported | L5,intake | H10 corresponding file skip counts, complete | D22 |
| unidentified-session | X1,I1 | H10 file skip, line-level malformed, rowsRecognised | D22 |
| very-long-line | L2 | Not planted held-out; stream cap needs sized dev data | D23 |
| invalid-utf8 | L3 | Not planted held-out; binary byte trap assigned to dev | D23 |
| model-conflict | C3,I2 | Not planted held-out; highest group-reason precedence | D05 |
| inherited-start | X8(b)/(d) | Not planted held-out; meta present but differing last | D10 |
| timestamp-context-switch | X2,X10.7 | Not planted held-out; switch exactly at usage timestamp | D10 |
| field-limit | N1 | Not planted held-out; >4096 code-point identity rejected | D23 |
| metadata-cap | 4.7 | Not planted held-out; configurable tiny-cap dev fixture | D24 |
| cache-hit-rounding, money-rounding | I7,P5 | Raw exact fractions/costs in every H answer; direct formatting assertions still needed | D19 |
| safe-exports | 4.7,I7 | H09 planted hostile data; CSV/Markdown/basename assertions in dev | D21 |
| dst | 4.5,I6 | Not planted held-out; civil-day DST boundaries | D12 |
| price-validation | P1,P3,P6 | Synthetic rows have source/date, missing optional rate; invalid rows dev only | D09 |
| missing-fields | I1 | H03 default absent cache split; H08 absent last/zero default buckets | D08 |
| retry-ambiguous-order | I4,4.5 | Not planted held-out; equal-time cross-file tie | D18 |

All spec-planted traps are represented: streaming, cross-file copies, sidechain, cached-in-input, unchanged totals,
last/delta mismatch, forks, unknown model, midday price change, civil-day edge, missing write split, malformed/truncated,
empty, very long/non-UTF8, hostile cwd/keys, error/success repeats, MCP names and shuffled lines. Only the very-long
and invalid-UTF8 spec traps lack held-out planting; M0 does not claim otherwise. M4 must provide full existing-fixture
coverage and check every named trap's scored field before acceptance.

## Planned dev allocation (not yet authored)

| Id | Planned focus |
|---|---|
| D01 | Claude five buckets and exact money |
| D02 | Codex totals/deltas/reasoning/repeats/mismatch, ordering, split copies |
| D03 | Claude identical/streaming snapshots and terminal selection |
| D04 | Cross-file attribution, duplicate turns, sidechain |
| D05 | Conflicts, model precedence, observed snapshots |
| D06 | Null requests, ambiguous merge, missing identity |
| D07 | Cache split assumptions/mismatch and raw matching |
| D08 | Count/timestamp validation, defaults, empty info, synthetic/error |
| D09 | Dated price shape/validation, unknown model/modifiers |
| D10 | Codex X10 branches, faults, inherited/fork starts and ambiguity |
| D11 | Civil-day timezone edge |
| D12 | DST and date-range validation |
| D13 | Pre-window baseline, filtered diagnostics/metrics |
| D14 | Price change at exact boundary |
| D15 | MCP, Codex tool/turn replay and unavailable errors |
| D16 | Canonical retry, successful predecessor, subagent isolation |
| D17 | Result conflict/orphan, missing/meta turns, late results |
| D18 | Equal-time cross-file retry ambiguity |
| D19 | Half-up cache hit/money display and exact exports |
| D20 | Session duration, five groupings, basename collision |
| D21 | Hostile strings, CSV/Markdown/prototype/React safety |
| D22 | BOM/blank/malformed/truncated/empty/unsupported intake |
| D23 | Overlong line/identity, invalid UTF-8 |
| D24 | Metadata cap, size budget and metamorphic controls |

## All rule ids

| Rules | Existing held-out / planned dev |
|---|---|
| L1 | H10; D22 |
| L2,L3 | D23 (planned) |
| L4,L5 | H10; D22 |
| N1 | H03,H10; D08,D23 |
| C1 | H01,H03; D01,D07 |
| C2 | H02,H03; D03,D04,D06 |
| C3,C3b | H02; D03,D04,D05 |
| C4 | H02,H09; D04,D16 |
| C5 | H03; D08 |
| C6,C7 | H01,H09; D15,D16,D17 |
| X1,X1b,X1c | H06,H07,H10; D02,D10,D22 |
| X1d | H07; D15 |
| X2,X3 | H06,H08; D02,D10 |
| X4,X5 | H01,H06; D02,D10 |
| X5b | H08; D10 |
| X6,X7 | H06; D02,D10 |
| X8,X9,X10 | H07,H08; D10,D15 |
| P1,P2,P3,P4 | H04; D09,D14 |
| P5 | H01,H04 (exact costs); D01,D19 (display) |
| P6 | Synthetic prices here; D09, M5 real-table verification (deferred) |
| I1,I2,I3 | H02,H03,H10; D04,D05,D06,D08 |
| I4,I5 | H07,H09; D15,D16,D17,D18 |
| I6 | H05; D11,D12,D13 |
| I7 | H01-H10 modelCalls/fractions; D19 |
| 4.5 | H03,H05,H09; D11-D20 |
| 4.6 | D19-D21 recap mutation assertions (planned) |
| 4.7 | H09,H10 intake/hostile data; D21-D24 safety/limits assertions (planned) |
| 4.10 | D12,D20,D24 CLI validation/output guard assertions (planned) |

Runtime tests, JSON Schema validation by a runtime validator, baseline failures, export safety and held-out scoring are
not yet run. M4 owns the full coverage checker; this file records construction-time assignments.
