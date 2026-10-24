# Held-out oracle worksheet â€” edition 1

Authoring: inherited H01-H10 synthetic logs by Claude blind author; answers/schema/worksheet completed by the independent
M0 coder from PLAN.md and those logs before any src exists. No real transcript, credential file, analyzer or parser was
consulted. Prices below were chosen as round synthetic rates before deriving costs; they are not vendor prices.
Status: manually derived and statically inspected; independent review and runtime validation pending. Freeze date
2026-10-24; split seed `s22-m0-2026-10-24-v1` identifies this authored split (no random split operation).
All logs are preserved byte-for-byte. Logs with only one provider intentionally have only that provider's directory.

Notation: vector `(I,O,W5,W1,R)`. All money expressions below give **millions of pico-USD** (multiply by 1,000,000
for expected.json). E.g. `29982` means `"29982000000"` pico-USD. Output already contains reasoning. Codex cumulative
notation `(input,cached,output,reasoning,cacheWrite)` is distinguished explicitly from bucket vectors.

## Price choice and fixture inputs

| Row | Effective UTC | Coefficients I,O,W5,W1,R (millions of micro-USD/MTok) | Other |
|---|---|---|---|
| A: claude-test-a | 2026-06-01T00:00:00Z | 2,10,3,4,1 | default supported modifiers |
| A2: claude-test-a | 2026-10-15T12:00:00Z | 4,20,6,8,2 | same model; latest row at/before event |
| B: claude-test-b | 2026-06-01T00:00:00Z | 1,5,2,missing,0.1 | prompt cap 200000, inclusive boundary |
| X: gpt-test-x | 2026-06-01T00:00:00Z | 1,4,missing,missing,0.5 | writes zero, missing rates unused |

Lists omitted means tiers standard/default; speed standard; geos global/not_available. Absent/null/empty modifier is
supported. `source_url` is the inert example.invalid synthetic provenance; retrieved=2026-10-24. Missing 1h B rate is
intentional. No row exists for claude-test-z, gpt-test-unpriced, unknown, or before June 1.
H01/H02/H04/H06-H10 use UTC and no date bounds. H03 uses Asia/Kolkata, no bounds. H05 uses America/New_York and both
bounds 2026-10-17. Every answer uses repository path fixtures/heldout/prices.test.json.

## H01 â€” baseline buckets, inclusive Codex cached/reasoning

Claude main lines 2/4/6 are separate verified calls:
- c01=(1200,80,2000,0,0): 2400+800+6000=9200.
- c02=(10,40,0,0,3200): 20+400+3200=3620.
- c03=(6,20,0,300,3200): 12+200+1200+3200=4612.
Claude sum=(1216,140,2000,300,6400), cost17432, calls3.
Codex first total=(5000,1000,300,100,0) equals last: zero baseline; buckets=(4000,300,0,0,1000), cost4000+1200+500=5700.
Second delta=(12000-5000,4500-1000,700-300,250-100,0)=(7000,3500,400,150,0);
buckets=(3500,400,0,0,3500), cost3500+1600+1750=6850. No extra reasoning bucket. Codex sum=(7500,700,0,0,4500), cost12550.
Total=(8716,840,2000,300,10900), cost29982, verified events5; cache=10900/21916.
Turns Claude2/Codex2; tools Bash1/shell1; Claude result ok1; retries0. Lines6+8=14, recognised14. One UTC day; complete=true.

## H02 â€” streaming, copies, null request and subagent

Use final two digits of message ids:
- 01: three rows, O5/O5/O120; unique terminal O120 wins, buckets=(500,120,0,0,0), cost1000+1200=2200; duplicates2.
- 02: same vector copied into another session/cwd; buckets=(40,60,0,0,500), cost80+600+500=1180;
  duplicate1, attribution_conflict1. I3 chooses original smaller session/cwd at the same timestamp.
- 03: two O10 snapshots, no terminal; observed_snapshot=(30,10,0,0,500), cost60+100+500=660; duplicate1.
- 04: terminal O50 and O70 conflict: no event; unresolved claude_conflicting_duplicates1; duplicate1.
- 05: normal and null-request terminal vectors equal; merge; buckets=(20,90,0,0,500), cost40+900+500=1440;
  request_id_missing1, request_id_missing_merged1, duplicate1.
- 06: requested O33 versus null-request O7 (no requested row with that snapshot). Requested event=(10,33,0,0,500),
  cost20+330+500=850; null row request_id_conflict1, request_id_missing1. No duplicate for the unresolved null row.
- 07: same sidechain call in main/subagent files; one event=(300,45,1000,0,0), cost600+450+3000=4050; duplicate1.
- 08: new copy-session call=(15,25,0,0,1540), cost30+250+1540=1820.
Totals I500+40+30+20+10+300+15=915; O120+60+10+90+33+45+25=383; W5=1000;
R500+500+500+500+1540=3540; cost2200+1180+660+1440+850+4050+1820=12200.
Verified=(885,373,1000,0,3040), events6; observed=(30,10,0,0,500), events1. Cache3540/5455.
Duplicates2+1+1+1+1+1=7. Turns main2+subagent1+new copy-session1=4; copied first user adds duplicate_turn1.
Read1/ok1, retries0. Lines16+2+4=22, recognised22. Complete=false (snapshot and two unresolved outcomes).

## H03 â€” cache assumptions, exclusions, Kolkata day edge

- 01 missing split: (100,50,4000,0,0), cost200+500+12000=12700; assumed5m1.
- 02 split200+300=500 differs from total600: cache_split_mismatch1, no event.
- 03 absent split but zero write total: (8,30,0,0,4000), cost16+300+4000=4316; no assumed5m.
- 04 synthetic zero; 05 synthetic nonzero; 06 API error zero: synthetic_or_error_row3, synthetic_nonzero_usage1.
- 07 API error nonzero counts normally: (12,3,0,0,0), cost24+30=54.
- 08 missing message.id: no_identity1, no event. 09 O=-5: bad_count1, skipped.
- 10 at18:29:59Z is23:59:59 Kolkata: (20,10,0,0,4000), cost40+100+4000=4140 on Oct14.
- 11 at18:30:01Z is00:00:01 Kolkata: same buckets/cost4140 on Oct15.
- 12 lowercase z: bad_timestamp1, skipped.
Total=(160,103,4000,0,12000); cost12700+4316+54+4140+4140=25350; events5 verified.
Oct14=(140,93,4000,0,8000), cost21210, events4. Oct15=(20,10,0,0,4000), cost4140, events1.
Cache12000/16160. Turns1, tools/results/retries0. Read13; recognised13-3-1-1=8. Complete=false.

## H04 â€” price date, whole prompt cap, modifiers and reason precedence

Claude events, all verified (unpriced means tokens still count):
| id | Vector | Cost / reason |
|---|---|---|
| 01 | (1000,100,0,0,0) | old A:2000+1000=3000 (one millisecond before switch) |
| 02 | (1000,100,0,0,0) | A2:4000+2000=6000 (exact switch; null speed supported) |
| 03 | (200,20,0,0,0) | no_price_row: model Z |
| 04 | (500,50,0,0,1000) | tier_unsupported: priority |
| 05 | (20000,300,0,0,190000) | tier_unsupported: prompt210000>200000 |
| 06 | (100,40,0,500,1000) | rate_missing: 1h write |
| 07 | (100,40,500,0,1000) | B:100+200+1000+100=1400; empty geo supported |
| 08 | (30000,10,0,100,180000) | tier_unsupported: fast precedes cap/missing rate |
| 10 | (10,10,0,0,0) | no_price_row: May31 precedes B; outranks fast |
| 09 | (10000,10,0,100,195000) | tier_unsupported: prompt205100 outranks missing rate |
| 11 | (10000,20,0,0,190000) | B:10000+100+19000=29100; prompt200000 accepted |

Claude sum=(72910,700,500,700,758000), known39500 (3000+6000+1400+29100), eleven events.
Codex first zero-start delta=(2000,500,100,0,0), buckets=(1500,100,0,0,500), model unpriced, no_price_row.
Next delta=(1000,400,60,10,0), buckets=(600,60,0,0,400), X with flex: tier_unsupported.
Last delta=(1000,400,40,0,0), buckets=(600,40,0,0,400), default tier:600+160+200=960.
Total=(75610,900,500,700,759300), cost40460, events14 verified. Known-price buckets=(12700,300,500,0,191400);
unknown-price buckets=(62910,600,0,700,567900). Unknown events9: no_price_row3, tier_unsupported5, rate_missing1;
models B6/Z1/gpt-test-unpriced1/X1. Token complete=true; cost.complete=false.
May31 has (10,10,0,0,0), known0, events1; Oct15 has (75600,890,500,700,759300), known40460, events13.
Cache759300/836110; turns Claude1/Codex2; tools/results/retries0. Read12+8=20, recognised20.

## H05 â€” filter uses civil days, baselines use full stream

Window New York Oct17 is [2026-10-17T04:00:00Z,2026-10-18T04:00:00Z).
Claude 01 at03:59:59Z is before window. 02 at04:00:01Z=(200,20,0,0,0), A2 cost800+400=1200.
03 offset23:59:59-04:00 is Oct18 03:59:59Z=(300,30,0,0,0), cost1200+600=1800.
04 and nonterminal05 lie after window. Conflicting06 rows lie Oct16: neither unresolved nor duplicate count is in window.
Codex first total(1000,200,50,0,0) precedes window, but remains baseline. Second total(3000,1200,150,20,0)
minus baseline=(2000,1000,100,20,0), buckets=(1000,100,0,0,1000), cost1000+400+500=1900.
Next same total in window: repeat1; its retained last does not trigger mismatch. Final mismatch lies after window.
Total=(1500,150,0,0,1000), cost1200+1800+1900=4900, verified events3, cache1000/2500.
Turns Claude1 (noon UTC)/Codex1 (05:00 UTC); tools0. Import-wide read9+7=16, recognised16.
No filtered unresolved/snapshot/mismatch; complete=true. One reported civil day.

## H06 â€” out-of-order/split stream, regression and exact baseline after bucket fault

Merge both same-session files; sort by timestamps, not lines. The second file's first row duplicates the first file's
12th row: duplicate_copy1. User-message and token_usage_record are ignored_record_kind2.
- 09:00:08 first total(4000,0,200,50,0) equals last: (4000,200,0,0,0), verified, cost4000+800=4800.
- 09:01:08 delta(5000,3000,300,50,0): (2000,300,0,0,3000), verified, cost2000+1200+1500=4700.
- 09:01:09 repeats total: repeat1, no mismatch.
- 09:02:08 delta(3000,2000,150,0,0): (1000,150,0,0,2000), verified, cost1000+600+1000=2600.
  Last says2500 input: last_delta_mismatch1; use computed3000.
- 09:30:05 total input drops12000->11000: total_regressed1; valid baseline becomes(11000,5000,700,100,0), reset1.
- 09:31:05 delta(3000,1000,200,50,0): (2000,200,0,0,1000), observed_epoch, cost2000+800+500=3300.
- 09:32:05 delta(500,1000,50,0,0): cached_exceeds_input1; no event; exact new cumulative baseline retained.
- 09:33:05 delta(1000,400,50,0,0): (600,50,0,0,400), observed_epoch, cost600+200+200=1000.
Verified=(7000,650,0,0,5000), three events; observed_epoch=(2600,250,0,0,1400), two events.
Total=(9600,900,0,0,6400), cost4800+4700+2600+3300+1000=16400; cache6400/16000.
Turns3; mcp__docs__search1 (server docs1), apply_patch1; Claude results0/Codex errors unavailable; retries0.
Read13+6=19; recognised19-2=17 (duplicates still recognised). Complete=false.

## H07 â€” proven replay prefix, replayed tool/turn history, separate zero child

Parent a1 first delta(2000,500,100,0,0): buckets=(1500,100,0,0,500), cost1500+400+250=2150.
Parent second delta(3000,2000,200,50,0): (1000,200,0,0,2000), cost1000+800+1000=2800.
Child b2 first two cumulative vectors equal parent's leading two despite restamped times; X8(c) runs before zero-start.
Drop two token_count records; baseline=(5000,2500,300,50,0). New total(7000,3000,450,50,0) delta(2000,500,150,0,0):
buckets=(1500,150,0,0,500), verified, cost1500+600+250=2350.
Child c3 first total(800,200,60,10,0) differs from parent's first, equals its own last: no replay usage;
buckets=(600,60,0,0,200), verified, cost600+240+100=940.
Each child embeds parent meta and replays two turns plus call/output. Embedded_parent_meta2; replay_turn_dropped4;
replay_tool_dropped4 (outputs count as records); replay_dropped2. All replayed contexts still set model/cwd.
Total=(4600,510,0,0,3200), cost2150+2800+2350+940=8240, verified events4, cache3200/7800.
Turns parent2+b2new1+c3new1=4; shell parent1+b2new1=2. All27 lines recognised; complete=true; no unknown price.

## H08 â€” unproven starts, tier ambiguity and step faults

Four files identified by final a1/b2/c3/d4:
- a1: parent ff has only embedded meta, not own selected records. Fork history unverified1, embedded_parent_meta1.
  First(6000,1000,400,0,0) differs from last: fork_unproven_prefix1; baseline only, reset1.
  Next delta(2000,1500,200,100,0): buckets=(500,200,0,0,1500), observed_epoch, cost500+800+750=2050.
  Its two turn_contexts and shell call count because parent is absent.
- b2 subagent: not a fork. Simultaneous default/flex settings leave tier ambiguous.
  First self-zero=(1000,50,0,0,0), verified, cost unknown tier_unsupported.
  Unambiguous default then delta(800,300,40,0,0): (500,40,0,0,300), verified, cost500+160+150=810.
- c3: filename identifies session, no meta, no self-zero proof. First(3000,1000,100,0,0) is baseline:
  session_meta_missing1/reset1. Next delta(1500,600,80,20,0): (900,80,0,0,600), observed_epoch, model unknown:
  no_price_row1. Final info:null is token_count_empty1, no step or complete effect.
- d4 first fresh-meta total with no last=(2000,0,100,0,0): (2000,100,0,0,0), verified, cost2000+400=2400.
  11:01 delta cacheWrite400: cache_write_unmodeled1, exact baseline kept, no epoch reset.
  11:02 delta reasoning120>output50: reasoning_exceeds_output1, exact baseline kept.
  11:03 tied totals(4000,300,300,120,400)/(3900,300,320,120,400) incomparable: one ambiguous_order outcome,
  baseline pending. Both records excluded, counted once. 11:04 valid total(4600,500,400,150,400) is baseline only,
  reset1, switches mode observed_epoch. 11:05 delta(1000,400,100,0,0): (600,100,0,0,400), cost600+400+200=1200.
  11:06 differing simultaneous contexts: next token step ambiguous_context1, exact baseline updated.
  11:07 single context resolves ambiguity before token time; delta(500,200,40,0,0): (300,40,0,0,200), observed_epoch,
  cost300+160+100=560. No extra ambiguous_order at11:07:05 (switch was11:07:00).
Total I500+1000+500+900+2000+600+300=5800; O200+50+40+80+100+100+40=610; R1500+300+600+400+200=3000.
Verified=(3500,190,0,0,300), events3; observed_epoch=(2300,420,0,0,2700), events4.
Known cost2050+810+2400+1200+560=7020. Unknown buckets=(1900,130,0,0,600); reasons tier1/no_price1;
models X1/unknown1. Six unresolved outcomes, baseline_reset_assumed3. Read8+7+3+14=32; recognised32-1=31.
Turns2+1+0+4=7; shell1; cache3000/8800; complete=false, cost.complete=false.

## H09 â€” tools, retry isolation, hostile strings, known-result coverage

Main six events: (100,20,0,0,0), then (10,20,0,0,R) for R100/120/140/160/180.
Their individual costs400,320,340,360,380,400 sum2200; main sum=(150,120,0,0,700).
Sidechain event=(50,10,0,0,0), cost100+100=200.
Second session events=(200,30,0,0,0), cost400+300=700; (10,30,0,0,200), cost20+300+200=520.
Third session Write duplicated in place: one event=(40,60,0,0,0), cost80+600=680; duplicate_rows1/duplicate_tool_use1.
Total=(450,250,0,0,900), cost2200+200+700+520+680=4300; verified events10; cache900/1350.
Tools Bash4 (three main plus sidechain), docs search2/fetch1, Read2, Write1: total10, MCP docs3.
Results: error2 (main01/main04); ok5 (main02/main03/sidechain/Read08/Write); unknown3
(search05 no flag, fetch06 no result, Read07 conflicting true/false). Status_conflict1, orphan_result1 for main99.
Retries2: main02 repeats failed main01 after its result; search05 repeats failed search04 with permuted JSON keys.
Main03 follows success, so no retry. Sidechain's Bash between main01/main02 is a separate sequence and cannot break it.
Read08 follows unknown conflict, so no retry. Turns main1+side1+second1+third1=4; isMeta excluded; uuid-less user adds
turn_identity_missing1 and no turn. Read13+3+7+5=28, recognised28. Complete=true.
Hostile cwd and prototype keys are inert synthetic strings; their events and tools remain counted. These arithmetic
answers do not prove CSV/Markdown escaping, React rendering or prototype safety; M3's direct assertions must do that.

## H10 â€” damaged lines, intake skips and unidentified file

Claude first line has planted BOM. Lines1/4 share message id: choose terminal O90 despite physical order, duplicate_rows1.
Event=(300,90,0,0,0), A2 cost1200+1800=3000. Line8 event=(50,10,0,0,300), cost200+200+600=1000.
Line2 timestamp-free summary is bad_timestamp1 under I1 (timestamps apply even to unsupported record kinds).
Line3 turn1. Line5 blank_line1; line6 terminated malformed JSON and line7 array: malformed_json2;
line9 invalid final JSON without newline: truncated_line1. Empty Claude JSONL: files_empty1. notes.txt ignored_non_jsonl1.
Codex identified file: first self-zero delta(1000,400,80,0,0) gives(600,80,0,0,400), cost600+320+200=1120.
Negative input line4 bad_count1 is rejected before state processing (does not reset baseline).
Next delta(500,200,40,0,0) gives(300,40,0,0,200), cost300+160+100=560.
Unidentified filename has two independent metas; codex_session_unidentified1. Its first three lines are unrecognised file
population, no record counters; final malformed line **has** a newline, so malformed_json1, not truncated_line.
Fake archive is .zst: compressed_unsupported1, not decoded/read. No credentials or real binary were used.
Total=(1250,220,0,0,900), cost3000+1000+1120+560=5680, verified events4; cache900/2150.
Turns Claude1/Codex1, tools/results/retries0. Read9+5+4=18. Line skips1blank+3malformed+1truncated+1badcount+1badtimestamp=7;
ignored kinds0; unidentified remaining3; recognised18-7-3=8. Complete=false; cost.complete=true.

## Freeze and later validation

MANIFEST.json hashes every inherited held-out input, expected.json, held-out price table, this worksheet, and the schema
and schema documentation. UTF-8/LF input is preserved; H10 alone has a planted BOM and truncated final line. No src/
exists at the M0 freeze. No first held-out runtime score exists. Independent review must re-derive these answers before
activation; after source exists, do not tune rules against held-out. A rule change requires a new fixture edition.
