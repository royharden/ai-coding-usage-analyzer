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

## M2 append: D11-D18

Author unchanged, 2026-10-24. Before this append, the full worksheet was copied to outer
`agentops/backups/m2-fixtures/oracle-worksheet.before-m2.0651.md`. The original D01-D10 entries above are unchanged.
These eight cases use the same bucket order and synthetic rates. Claude A rates on/after 2026-10-15T12:00:00Z are
**(4,20,6,8,2)** million pico/token. Every emitted event below is verified; unknown-price populations and both
observed-quality bucket objects are zero. Cost completeness is true throughout; accounting completeness is true except
D17. All skips/unresolved/counters not explicitly stated are zero. No held-out data or product execution informed them.

### D11: Kolkata civil midnight

| Timestamp | Asia/Kolkata civil day | Buckets | Cost, millions |
|---|---|---|---|
| 2026-10-14T18:29:59Z | Oct 14, 23:59:59 | (2,1,1,0,1) | 4+10+3+1 = 18 |
| 2026-10-14T18:30:00Z | Oct 15, 00:00:00 | (3,2,0,1,2) | 6+20+4+2 = 32 |
| 2026-10-15T00:00:00+05:30 | Oct 15, 00:00:00 | (1,0,0,0,1) | 2+1 = 3 |

The last two rows are the same instant but distinct message identities. Sum **(6,3,1,1,4)**, **53,000,000 pico**,
three Claude events; cache **4/12**, rows read/recognised **3/3**. Oct 14 has one event, buckets (2,1,1,0,1), 18 million;
Oct 15 has two events, buckets (4,2,0,1,3), 35 million. Pricing uses the event instant, not the displayed civil date.
Turns, tools and retries zero. Explicit splits also provide an accounting-control case.

### D12: New York fall-back day and inclusive endpoints

Filter `since=until=2026-11-01`, `tz=America/New_York`: the admitted UTC window is
**[2026-11-01T04:00:00Z, 2026-11-02T05:00:00Z)**, 25 hours.
The :03:59:59.999Z row before the start and Nov 2 :05:00:00Z row at the exclusive end are excluded.
Included input/output pairs are **(2,1)** at the start, **(3,1)** at 05:30Z (first local 01:30), **(4,1)** at 06:30Z
(second local 01:30), and **(5,1)** at Nov 2 04:59:59.999Z (last local millisecond).
All use the doubled Claude A price: **14×4+4×20 = 136 million**. Sum **(14,4,0,0,0)**, **136,000,000 pico**, four
Claude events in the sole byDay entry Nov 1; cache **0/14**. Import rows read/recognised **6/6**, no other counters.
The repeated wall-clock hour counts both distinct messages. No accounting-control tag is asserted for this time case.
Invalid zone/date/reversed-range rejection has no fixture error-result shape and remains M2 CLI/time unit-test source.

### D13: pre-window state and filtered diagnostic populations

UTC filter `since=until=2026-10-14`. Codex session state is computed over all rows before filtering:

| UTC time | Cumulative vector / outcome | Selected contribution |
|---|---|---|
| Oct 13 23:59:52 | [100,20,30,5,0], last equals total | pre-window event excluded |
| Oct 13 23:59:53 | [110,35,32,5,0], cached delta 15 > input delta 10 | unresolved pre-window fault excluded; vector remains exact baseline |
| Oct 13 23:59:54 | [120,40,36,6,0], incorrect logged last | pre-window event and mismatch counter excluded; identical extra copy counts import-wide |
| Oct 14 00:00:01 | [150,50,46,7,0] minus prior [120,40,36,6,0] | (20,10,0,0,10), cost 20+40+5 = 65 million |
| Oct 14 12:00:00 | repeated [150,50,46,7,0] | codex_repeat_total=1, no event |
| Oct 14 23:59:59.999 | [170,55,50,8,0] minus prior vector | (15,4,0,0,5), cost 15+16+2.5 = 33.5 million |
| Oct 15 00:00:00 and :00:01 | next delta, then regression | events/step reasons/reset excluded at or after exclusive end |

Codex selected sum **(35,14,0,0,15)**, **98.5 million**, two events. Only its in-window context contributes a turn.
Fourteen Codex lines minus one ignored kind and one empty token info = **12 recognised**; its copied pre-window
token record gives `duplicate_copy=1` even though its usage is outside the window.

Claude's pre-window Read call and explicit failed result precede an in-window Read with equal canonical nested input.
The selected call is therefore **one retry** even though its predecessor is not in the selected tool population. Its
own later result is successful: selected toolResults **error 0 / ok 1 / unknown 0**, one Read tool. Selected usage is
**(2,1,0,0,0)**, **14 million**. Only the in-window plain user row contributes a Claude turn. Pre-window conflicting
usage group, duplicate rows, nonterminal snapshot and null request all remain excluded from their scored families;
they do not make filtered accounting incomplete. A zero synthetic row still counts one import-wide synthetic skip;
an ignored summary still counts import-wide. Twelve Claude lines minus synthetic skip and ignored kind = **10 recognised**.

Overall **(37,15,0,0,15)**, **112,500,000 pico**, three events (Claude 1 / Codex 2), cache **15/52**, turns **1/1**.
Rows read/recognised **26/22**; counters `duplicate_copy=1`, `codex_repeat_total=1`, `ignored_record_kind=2`,
`codex_token_count_empty=1`; skip `synthetic_or_error_row=1`. Unresolved map empty, complete true. All events belong
to Oct 14. The four excluded-row families and pre-window retry state are deliberate accounting-control material.

### D14: exact midday price switch

All four events display on Oct 15 UTC. Before switch at **11:59:59.999Z**, buckets **(2,1,1,1,1)** cost
4+10+3+4+1 = **22 million**. Exactly **12:00:00Z**, the same buckets cost 8+20+6+8+2 = **44 million**.
At **12:00:00.0009Z**, submillisecond digits truncate to the switch millisecond; **(1,0,0,0,1)** costs 4+2 = **6 million**.
At **17:30:00+05:30** (also exactly 12:00Z), **(2,0,0,0,0)** costs **8 million**.
Sum **(7,2,2,2,3)**, **80,000,000 pico**, four Claude events; cache **3/14**, rows read/recognised **4/4**.
No turns/tools/retries/other counters. One-price-for-all-dates control must fail the exact cost.

### D15: MCP, Codex replay and unavailable error semantics

Claude has two usage events **(2,1,0,0,0)** and **(1,1,0,0,0)**, cost **14+12 = 26 million**.
Its three tools are mcp__forge__search (explicit error), Read (explicit success), and mcp__forge__fetch (unflagged result,
unknown). Result-only user rows are not turns. Four Claude rows, all recognised.

Codex parent 1501 has one context, one mcp__forge__search call and output, and self-proving first total [10,2,4,1,0]:
emit **(8,4,0,0,2)**, cost **8+16+1 = 25 million**, one parent turn/tool. Its five rows are recognised.
Child 1502 has own + embedded-parent meta, replayed parent context/call/output, new context, one new exec_command custom
call/output, and self-proving first total [7,1,3,1,0]: emit **(6,3,0,0,1)**, cost **6+12+0.5 = 18.5 million**.
The replayed context and both replayed tool records are excluded from metrics but still participate in context state.
Child has nine recognised rows, one new turn/tool; no usage-prefix replay occurs because its first total differs from
the parent's. Output strings resemble exit-code failures; Codex errors/retries are never inferred from them.

Overall **(17,9,0,0,3)**, **69,500,000 pico**, four events (Claude 2 / Codex 2), cache **3/20**, turns **Claude 0 / Codex 2**.
Tools **5**: search MCP **2**, fetch MCP **1**, Read **1**, exec_command **1**; MCP server forge **3** is a subset, not
three extra tools. Claude-only results **1 error / 1 ok / 1 unknown**, retries zero.
Counters `codex_embedded_parent_meta=1`, `codex_replay_tool_dropped=2`, `codex_replay_turn_dropped=1`;
rows read/recognised **18/18**. Complete true. Replayed copies provide accounting-control material.

### D16: canonical retries, successes and subagent isolation

One session has main and two agentId sequences. Source order is:
**main a/error → child x/error → main b/success → child y/success → main c/error → main d/success → other-child z/error
→ main e/success**. Results precede subsequent candidate calls. Main a/b/c/d are Read with identical canonical input
despite nested key reorder; e is Search (a different name). Child x/y are Write with reordered equal input; z is equal
Write input in a different agentId sequence.
Count retries only for **b, y, d = 3**. c follows successful b and is not a retry; e changes name; z has no predecessor
in its own sequence. Child interleaving does not displace main's predecessor. The successful results on b/y/d are not
the criterion for their own retry status; the predecessor's failure is.
Main's five usage events each contribute (1,1); child x/y each (2,1); other-child z (3,1).
Sum **(12,8,0,0,0)**, cost **12×2+8×10 = 104 million**, eight Claude events; cache **0/12**.
Tools **8**: Read **4**, Write **3**, Search **1**; results **4 error / 4 ok / 0 unknown**; no turns.
Rows read/recognised **16/16**, no other counters. Complete true. No accounting-control tag is asserted here.

### D17: late result, status conflict, orphans and turns

| Call/group | Outcome |
|---|---|
| a Read at :00 | (1,1), 12 million; error result only arrives :03 |
| b equal Read at :01 | (1,1), 12 million; no retry because a's error was not before b; own result success :04 |
| c Search at :05 | (2,1), 14 million; true and false result flags conflict, so one unknown status and status-conflict counter |
| orphan result :08 | no matching call, orphan_tool_result=1; excluded from result population |
| d Write at :09 | (3,1), 16 million; unflagged result is unknown |
| e Read copied at :15/:16 | distinct nonterminal usage vectors (9,1)/(9,2), one unresolved group; tool still counts once and is unknown with no result |

Turn rows: normal uuid at :10 and its later copy at :11 count **one** turn plus duplicate-turn **1**; meta row :12 is
excluded; missing uuid :13 counts `turn_identity_missing=1`, no turn; mixed text plus tool_result at :14 is an eligible
second turn and supplies d's unflagged result. Tool-result-only rows never become turns.
Selected usage **(7,4,0,0,0)**, **54,000,000 pico**, four Claude events; cache **0/7**.
Tools **5**: Read **3**, Search **1**, Write **1**; result statuses **1 error / 1 ok / 3 unknown**; retries **0**.
Unresolved `claude_conflicting_duplicates=1`; counters duplicate usage rows **1**, duplicate tool use **1**, status
conflict **1**, orphan result **1**, duplicate turn **1**, missing turn identity **1**; rows read/recognised **16/16**.
Accounting complete false because of unresolved usage, while tool and turn counts remain scored. Cost complete true.
The admitted `canonical-retry` trap also covers this late-result negative case; no new trap name was introduced.

### D18: cross-file tie versus same-file line ordering

Cross-file sequence: Read pre-call at :00 has explicit error at :01, followed by two equal-name/input Read calls at
**:02 in alpha.jsonl and beta.jsonl**. Both tied candidates have unknown order, so **retry_ambiguous_order=2**, no retry
from either. Both have their own later error results. Their usage inputs are **1,2,3** respectively, output **1 each**.
A different session in alpha.jsonl has Read call, explicit failed result, and equal Read call all at **:05**, in that
line order. The result precedes the candidate within one file, so it gives **one valid retry**; final result is success.
Its two usage events each have input/output **(1,1)**.

Sum **(8,5,0,0,0)**, cost **8×2+5×10 = 66 million**, five Claude events; cache **0/8**.
Tools Read **5**; result statuses **4 error / 1 ok / 0 unknown**; retries **1**, retryAmbiguous **2**.
Rows read/recognised **10/10**, sole other counter `retry_ambiguous_order=2`; no turns, unresolved usage or skips.
Complete true. No accounting-control tag is asserted for this ordering-only case.

The M2 cases remain source/static construction. Invalid-input rejection, retry digest privacy, five report groupings,
export formatting and all runtime comparisons belong to their source tests and deferred activation, not these oracle
claims. Long-line/invalid-UTF8 intake cases remain assigned to D23 by TRAPS.md; no such data was added in M2.
