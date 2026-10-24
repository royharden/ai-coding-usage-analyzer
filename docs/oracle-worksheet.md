# Dev oracle worksheet, edition 1

Author: `0651_Codex_GPT-61Sol_Sub_M1-Fixtures`, 2026-10-24. D01-D10 were authored from outer `PLAN.md`,
`docs/EXPECTED-SCHEMA.md`, `docs/TRAPS.md` and the frozen dev price table. No held-out file or real transcript was
read. No product, test, build, eval, demo, app import, dependency install or network call was used to derive these answers.
The entries below are hand arithmetic; fixture JSON writing/parsing and file inspection are construction operations.

All reports use UTC, no date filters, and `fixtures/prices.test.json`. Except D09's explicitly dated row, all rows are
2026-10-14. Bucket notation is **(input, output, write5m, write1h, read)**. Codex cumulative notation is **[input,
cached, output, reasoning, write]**; `total_tokens` is informational and unused. Prices below are millions of pico-USD
per token: Claude A **(2,10,3,4,1)**; Claude B **(1,5,2,missing,0.1)**; GPT X **(1,4,missing,missing,0.5)**.
Each displayed cost in millions is multiplied by 1,000,000 for `knownPico`; all JSON amounts are exact decimal strings.
Claude A's doubled row beginning 2026-10-15T12:00:00Z is deliberately not selected in this M1 batch.

Every expected answer carries all schema populations, including zero turns/tools/results/retries and all three quality
bucket objects. Sparse diagnostic/name maps omit zero entries. Tool populations and retry counts are zero throughout;
D04 has one Claude turn; D02/D08/D09 each have one Codex turn; D10 has fifteen Codex turns. `modelCalls = events`.
Each fixture is tagged `accounting-control`: duplicate/stream, cumulative, cache, invalid-row or price handling must
separate a future naive control from the exact oracle. This is a prospective requirement, not an executed control result.

## D01: Claude five buckets

| Message | Emitted buckets | Known cost, millions |
|---|---|---|
| a | (10,3,4,2,5) | 10×2 + 3×10 + 4×3 + 2×4 + 5×1 = 75 |
| b | (1,2,0,0,0) | 1×2 + 2×10 = 22 |
| c | (0,0,0,1,0) | 1×4 = 4 |

Sum **(11,5,4,3,5)**, **101,000,000 pico**, three verified Claude events. The explicit split on a sums to six and
replaces the raw write total rather than adding to it. c's one-hour rate is charged despite zero input/output.
Cache hit is **5/23**. Read/recognised **3/3**; no skips, unresolved groups or other counters. Both completeness flags true.

## D02: Codex cumulative accounting, physical shuffle and split copy

The same synthetic session UUID occurs in two filenames. Physical order puts total 160 before the meta/context;
processing order is by timestamp. The copy of the final record is one `duplicate_copy`.

| Time suffix | Cumulative vector | Delta / outcome | Emitted buckets | Cost, millions |
|---|---|---|---|---|
| :02 | [100,40,20,5,0] | first last equals total, zero start | (60,20,0,0,40) | 60+80+20 = 160 |
| :03 | [140,50,30,8,0] | [40,10,10,3,0] | (30,10,0,0,10) | 30+40+5 = 75 |
| :04 | [140,50,30,8,0] | zero delta: repeat only | none | excluded |
| :05 | [160,60,36,9,0] | [20,10,6,1,0]; logged last [99,0,99,0,0] is wrong | (10,6,0,0,10) | 10+24+5 = 39 |

Reasoning is contained in output and never added. Sum **(100,36,0,0,60)**, **274,000,000 pico**, three verified Codex
events; cache **60/160**; one Codex turn. Eight source lines minus one ignored `token_usage_record` = **7 recognised**.
Counters: `duplicate_copy=1`, `codex_repeat_total=1`, `codex_last_delta_mismatch=1`, `ignored_record_kind=1`.
No unresolved usage or unknown prices; both completeness flags true.

## D03: streaming terminal and identical rows

Message a has (4,1) nonterminal and two (4,5) terminal rows: choose (4,5), duplicates **2**, cost 8+50 = **58** million.
Message b has identical (2,3) rows, one terminal: choose one verified (2,3), duplicates **1**, cost 4+30 = **34** million.
Physical order puts b's terminal before its earlier nonterminal; it does not change resolution.
Sum **(6,8,0,0,0)**, **92,000,000 pico**, two verified Claude events. Cache **0/6**; read/recognised **5/5**;
`claude_duplicate_rows=3`. Both completeness flags true.

## D04: cross-file history, sidechain and duplicated turn

Main message copies differ in session/cwd/sidechain; earliest candidate at :02 belongs to `d04-session-a`,
`/synthetic/alpha`, main. It emits **(7,2,0,0,0)**, cost 14+20 = **34** million, once;
`claude_attribution_conflict=1`. The sidechain message is byte-identical in both files and emits
**(3,1,0,0,2)**, cost 6+10+2 = **18** million, once. Its sidechain flag does not multiply the event.
The copied user row is one turn by uuid, with `claude_duplicate_turn=1`.
Sum **(10,3,0,0,2)**, **52,000,000 pico**, two verified Claude events; cache **2/12**.
Read/recognised **6/6**, `claude_duplicate_rows=2`. Both completeness flags true.

## D05: observed snapshot and conflict precedence

| Group | Rows and resolution | Contribution |
|---|---|---|
| snapshot | two identical nonterminal (5,2,0,0,1) rows | one observed_snapshot, cost 10+20+1 = 31 million |
| conflict | nonterminal (100,1) and (100,2), no terminal | unresolved claude_conflicting_duplicates |
| model | A and B on one identity; both also have raw write total 5 but split 1+1 | unresolved claude_model_conflict, which wins over cache mismatch |
| two-terminals | terminal (20,1) and terminal (20,2) | unresolved claude_conflicting_duplicates |

Each two-row group contributes one duplicate counter even when unresolved: **4** total.
Sum **(5,2,0,0,1)**, **31,000,000 pico**, one observed_snapshot Claude event; verified buckets all zero;
cache **1/6**. Read/recognised **8/8**. `claude_nonterminal_snapshot=1`;
unresolved **conflicting_duplicates=2**, **model_conflict=1**, with no separate cache-mismatch reason.
Accounting complete false; cost complete true (only the emitted population is priced).

## D06: null request matching and missing identity

| Message | Rows / identity result | Emitted buckets and cost, millions |
|---|---|---|
| a | request snapshot (4,1), request terminal (4,3), null snapshot (4,1) merges by a logged nonterminal | (4,3,0,0,0), 8+30 = 38; duplicates 2 |
| b | request b1 (2,1), request b2 (2,1), null (2,1) matches both | two (2,1,0,0,0), 2×(4+10) = 28; null request_id_conflict |
| c | request (1,1), null (9,9) matches no logged vector | (1,1,0,0,0), 2+10 = 12; null request_id_conflict |
| d | two null-only identical terminal (3,2) rows | (3,2,0,0,0), 6+20 = 26; duplicates 1 |
| missing id | valid usage (9,9), no message.id | unresolved no_identity; no contribution |

Sum **(12,8,0,0,0)**, **104,000,000 pico**, five verified Claude events; cache **0/12**.
Read/recognised **11/11**; `request_id_missing=5`, `request_id_missing_merged=1`, `claude_duplicate_rows=3`.
Unresolved `request_id_conflict=2`, `no_identity=1`. Accounting complete false; cost complete true.

## D07: cache assumptions, raw mismatch matching and flag identity

The assumed row emits **(2,1,5,0,3)**, cost 4+10+15+3 = **32** million, with `assumed5m=1`.
The explicit 5+0 split on a different message emits the same buckets and **32** million without that flag.
The bad-split request and null-request rows have identical raw fields: total 5, split 2+1, input 8, output 2, read 1.
The null row therefore merges, poisons its group and yields exactly one `cache_split_mismatch`, one duplicate,
`request_id_missing=1`, and `request_id_missing_merged=1`; neither row emits.
The flag group has two terminal rows with equal numeric buckets (1,1,5,0,0), but assumed versus explicit writes:
the assumed5m bit makes two distinct terminal vectors, so `claude_conflicting_duplicates=1` and one duplicate.
No assumed5m counter is charged for that unresolved group.
Sum **(4,2,10,0,6)**, **64,000,000 pico**, two verified Claude events; cache **6/20**;
read/recognised **6/6**, `claude_duplicate_rows=2`. Accounting complete false; cost complete true.

## D08: validation and absent fields

| Claude row | Outcome / contribution |
|---|---|
| s0, s1, e0 | synthetic zero, synthetic positive, API error zero: three synthetic_or_error_row skips; synthetic_nonzero_usage=1 |
| e1 | nonzero API-error usage is ordinary verified (3,1,0,0,0), cost 6+10 = 16 million |
| defaults | absent optional cache fields: verified (2,2,0,0,0), cost 4+20 = 24 million |
| no-model | absent model becomes unknown: verified (1,1,0,0,0), no_price_row |
| missing-input, negative, fraction, unsafe | four bad_count skips (unsafe = 9007199254740992) |
| bad-ts | lowercase t/z: bad_timestamp |
| precedence | negative count plus invalid timestamp: bad_count wins, making five bad_count total |
| no-stop | absent stop_reason means nonterminal: observed_snapshot (1,0,0,0,0), cost 2 million |
| summaries | valid timestamp: ignored_record_kind; missing timestamp: bad_timestamp (two bad_timestamp total) |

Codex: meta + one context + two token_count records with null/empty info + fresh valid total with only input=4,
output=2 + unsupported token_usage_record. The empty records contribute `codex_token_count_empty=2`, not events.
Absent last on fresh meta and absent optional components yield verified **(4,2,0,0,0)**, cost 4+8 = **12** million.
The unsupported record adds the second ignored-kind count. Codex turns **1**.

Sum **(11,6,0,0,0)**, **54,000,000 known pico**, five events (Claude 4, Codex 1); verified
**(10,6,0,0,0)** over four events, snapshot **(1,0,0,0,0)** over one. Unknown tokens **(1,1,0,0,0)**,
one event, model `unknown`, reason `no_price_row`. Cache **0/11**.
RowsRead **21**; recognised **21−3−5−2−2−2 = 7** (synthetic skips, bad counts, bad timestamps, ignored kinds, empty info).
Both completeness flags false. No unresolved group is manufactured from a skipped row.

## D09: exact model/date pricing, modifiers and ambiguous tier

| Claude message | Buckets | Price outcome |
|---|---|---|
| known | (2,1,0,0,0) | 4+10 = 14 million |
| before-price, 2026-05-31T23:59:59Z | (2,1,0,0,0) | no_price_row (first row effective June 1) |
| exact-model | (3,2,0,0,0) | claude-test-a-family has no exact row; no_price_row wins over priority modifier |
| tier | (4,1,0,0,0) | tier_unsupported |
| speed | (5,1,0,0,0) | tier_unsupported |
| geo | (6,1,0,0,0) | tier_unsupported |
| default-modifiers | (1,1,0,0,0) | null/empty modifiers are supported defaults: 2+10 = 12 million |

Codex two differing tier settings at :01 create ambiguous tier, not ambiguous model context. First total
[10,2,2,1,0] self-proves zero: emit **(8,2,0,0,2)** with tier_unsupported. A single default setting at :03
resolves tier; next total [14,3,3,1,0] emits **(3,1,0,0,1)**, cost 3+4+0.5 = **7.5** million.

Sum **(34,11,0,0,3)**, **33,500,000 known pico**, nine verified events (Claude 7, Codex 2); cache **3/37**.
Unknown **(28,8,0,0,2)** over six events: no_price_row **2**, tier_unsupported **4**;
by model Claude A **4**, exact absent family **1**, GPT X **1**. Read/recognised **14/14**; Codex turns **1**.
May 31: one event (2,1), known cost zero but explicitly unknown. October 14: eight events **(32,10,0,0,3)**,
known cost 33,500,000. Accounting complete true; cost complete false.

The `price-validation` trap's rejected-table cases cannot be represented as a scored `s22-expected/1` answer:
this schema admits only the two canonical price paths and has no thrown-validation outcome. D09 deliberately does
not claim that trap. M1 price unit-test source owns missing source/date, invalid effective instant, negative/fractional
rate and duplicate (model,effective_from) rejection. Those tests remain unexecuted. M4 must reconcile the planned trap
matrix with this distinction. No shared price file or schema was changed.

## D10: X10 branch sessions and price-fault precedence

Filename UUID suffixes 1001..1013 identify separate Codex sessions. Each context counts one distinct turn except
1010 (four contexts with distinct turn_ids), and 1013 (no context, zero turns). Total Codex turns **15**.
All child meta ids are synthetic; 1004/1005 name selected parent 1003; 1006 names absent 9999. Embedded meta never
makes 9999 selected.

| Session | Ordered cumulative steps / exclusions | Emitted buckets (quality), known cost in millions |
|---|---|---|
| 1001 regression | [10,2,4,1,0]; [5,1,2,0,0] regresses and is a valid new baseline; [9,2,4,1,0] | (8,4,0,0,2) verified, 25; (3,2,0,0,1) observed_epoch, 11.5 |
| 1002 bucket faults | [10,0,4,0,0]; [12,3,5,0,0] cached delta 3 > input delta 2; [15,3,6,0,1] positive write delta; [18,3,7,2,1] reasoning delta 2 > output delta 1; [22,4,9,3,1] | (10,4,0,0,0) verified, 26; (3,2,0,0,1) verified, 11.5. Faults advance an exact baseline and preserve verified mode |
| 1003 parent | [20,4,6,1,0]; [30,6,8,2,0] | (16,6,0,0,4) verified, 42; (8,2,0,0,2) verified, 17 |
| 1004 replay child | first two totals/turn_ids match parent's leading token subsequence at restamped times; then [35,7,10,2,0] | two dropped replay tokens, then (4,2,0,0,1) verified, 12.5 |
| 1005 zero child | first [7,1,3,1,0] differs from parent's prefix and equals its own last | (6,3,0,0,1) verified, 18.5 |
| 1006 unproven fork | first [10,2,4,1,0], last [2,0,1,0,0]: uncounted baseline; then [15,3,6,1,0] | (4,2,0,0,1) observed_epoch, 12.5 |
| 1007 missing meta | context only; first [8,1,3,1,0] without last: uncounted baseline; then [12,2,5,1,0] | (3,2,0,0,1) observed_epoch, 11.5 |
| 1008 inherited fresh meta | first [9,1,3,1,0], last [2,0,1,0,0]: uncounted baseline; then [12,2,5,1,0] | (2,2,0,0,1) observed_epoch, 10.5 |
| 1009 incomparable start | tied [10,1,3,1,0] and [9,2,4,1,0]: one ambiguous set, pending baseline; [12,3,5,1,0] baseline only; [16,4,7,2,0] | (3,2,0,0,1) observed_epoch, 11.5 |
| 1010 contexts | two differing contexts at :01; [10,2,4,1,0] unresolved ambiguous_context. Single context and total [14,3,6,1,0] at :03 resolve ambiguity at exact usage time: unresolved ambiguous_order. [18,4,8,2,0] emits. Model switches to Claude A with total [22,5,10,2,0] at :05: unresolved ambiguous_order. [26,6,12,3,0] emits under Claude A | (3,2,0,0,1) verified GPT X, 11.5; (3,2,0,0,1) verified Claude A, 27 |
| 1011 invalid regression | [10,2,4,1,0]; [4,5,3,1,0] regresses and cached>input makes baseline pending; [8,2,4,1,0] valid baseline only; [12,3,6,2,0] | (8,4,0,0,2) verified, 25; (3,2,0,0,1) observed_epoch, 11.5 |
| 1012 no-meta zero | context + first [6,1,2,0,0] equal last | (5,2,0,0,1) verified, 13.5 |
| 1013 no context | meta contains model gpt-test-x, but model is only sourced from context; first [5,1,2,1,0] equals last | (4,2,0,0,1) verified, unknown/no_price_row, model unknown |

There are **18** Codex emitted events: **12 verified** summing **(78,35,0,0,17)** and **6 observed_epoch** summing
**(18,12,0,0,6)**. Codex known costs by session are 36.5+37.5+59+12.5+18.5+12.5+11.5+10.5+11.5+38.5+36.5+13.5
= **298.5 million**; 1013 is explicitly unknown and contributes no known cost.

Five Claude events add these price cases (all verified):

| Message | Buckets | Outcome |
|---|---|---|
| long | (1,1,0,1,200000) | Claude B whole prompt 200002 exceeds 200000: tier_unsupported wins over missing 1h rate |
| rate | (2,1,0,1,0) | Claude B within prompt cap: rate_missing |
| unknown | (3,1,0,1,0) | model claude-test-missing: no_price_row wins over modifier/rate concerns |
| modifier | (4,1,0,1,0) | Claude B priority tier: tier_unsupported wins over missing 1h rate |
| priced | (1,1,1,0,1) | Claude B: 1+5+2+0.1 = 8.1 million |

Claude sum **(11,5,1,4,200001)**; overall sum **(107,52,1,4,200024)**, **306,600,000 known pico**, **23** events
(verified **17**, observed_epoch **6**), verified buckets **(89,40,1,4,200018)** and observed buckets above. Cache
hit **200024/200136**. Unknown tokens **(14,6,0,4,200001)** over five events: tier_unsupported **2**, rate_missing **1**,
no_price_row **2**; models Claude B **3**, missing Claude model **1**, unknown **1**.

Unresolved: total_regressed **2** (1001,1011); cached_exceeds_input **1**, cache_write_unmodeled **1**,
reasoning_exceeds_output **1** (1002); fork_unproven_prefix **1** (1006); session_meta_missing **1** (1007);
inherited_start **1** (1008); ambiguous_order **3** (1009 set and two 1010 exact-time switches); ambiguous_context **1**
(1010). No unresolved step emits tokens or costs. `baseline_reset_assumed=6`: sessions 1001/1006/1007/1008/1009/1011,
once each; 1011's invalid regression does not count a reset until the next valid baseline.
Other counters: `codex_embedded_parent_meta=3` (1004/1005/1006), `codex_replay_dropped=2` (1004),
`codex_fork_history_unverified=1` (1006). No replayed tool or turn identity is planted here; D15 owns that trap.
Codex source lines by session **5+7+4+6+4+5+3+4+6+10+6+2+2 = 64**, plus five Claude lines = **69 read/recognised**.
All emitting last vectors match the computed deltas; bucket-fault/nonemitting rows do not trigger X6.
Both completeness flags false.

## Construction limits

These are synthetic expectations, not a score. Static JSON parsing, closed-key/enum inspection, literal arithmetic
review and source line counts do not verify a parser, JSON Schema runtime, baseline, renderer, export or evaluator.
Independent review and later activation must rederive the worksheet, run the admitted checks and reconcile fixture
coverage. Held-out contents, manifest and shared contracts are unchanged by this work.
