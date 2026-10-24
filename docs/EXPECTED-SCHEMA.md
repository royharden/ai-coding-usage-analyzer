# Exact fixture oracle: s22-expected/1

This is a hand-authored scoring contract, separate from `s22-report/1`. The normative machine shape is
`fixtures/expected.schema.json` (JSON Schema 2020-12). M0 defines it before parser code exists.
No analyzer, test, build, eval, demo or dependency install has run. Static file parsing and hashing are not an analyzer score.

Every object is closed except model/tool/server name maps and date-keyed `byDay`. Unknown diagnostic keys fail scoring.
All root keys in the schema are required. Missing **entries inside diagnostic/name maps** mean zero; the evaluator
normalizes absent entries to zero and compares the union of keys. Unknown reason codes fail even when zero.
No tolerance, floating-point cost, family-model alias or unknown-to-zero substitution is permitted.

- `schema`, `id`: exact schema literal and `Dnn`/`Hnn` fixture id.
- `tz`, `since`, `until`: test inputs; null dates mean unbounded. Inclusive civil dates define
  `[start-of-since, start-of-day-after-until)` in `tz`. Validate the zone/calendar/range before reading logs.
- `prices`: repository-relative path, never relative to the individual fixture. Held-out has its own frozen copy.
- `tags`: optional content expressed as a required array; `accounting-control` requires the naive control to differ.
- `traps`: unique names from `docs/TRAPS.md`; required nonempty array. Each accounting trap has an observable scored
  field. Hostile string export safety also needs the M3 export/security assertions; accounting totals alone cannot prove it.
- `tokens`: exactly `input`, `output`, `cacheWrite5m`, `cacheWrite1h`, `cacheRead`, over **all emitted events**.
  `tokensByQuality` has those same buckets for `verified`, `observed_snapshot`, `observed_epoch`.
  Every token, money amount and exact fraction component is a nonnegative decimal **string**, with no sign or leading zeros.
- `cost.knownPico`: sum of known-price event costs, in pico-USD. Each bucket is multiplied by its integer
  micro-USD/MTok rate; do not divide. `unknownPriceTokens` contains all buckets of unknown-price events.
  `unknownPriceEvents` has `total`, `byReason`, `byModel`, each counting events. Both map totals equal `total`.
  `cost.complete` is true iff that total is zero; token-accounting `complete` is independent.
- `cacheHit`: exact numerator `cacheRead`; denominator `input+cacheRead+cacheWrite5m+cacheWrite1h`, including observed
  events and unknown-priced events. A zero denominator displays `n/a`; otherwise round half-up to one decimal percent (I7).
- `events`: `total`, three `byQuality` counts, and `byAgent {claude,codex}`; both subdivisions sum to total.
  `modelCalls` equals total, including observed events. Counts are nonnegative safe JSON integers, not bigint strings.
- `turns {claude,codex}`: C7/I4 and X9/I5 populations, not model calls. Tool-result-only and meta user rows are not turns.
- `tools`: total calls, `byName`, `byMcpServer`. MCP calls appear once in the name map and once in their server subgroup;
  the latter is a subset, not an additional count. Codex outputs are not extra calls.
- `toolResults {error,ok,unknown}`: one status per **Claude** call, including no-result calls as unknown. Conflicting
  explicit result flags yield unknown. Orphan results never enter this population. Codex errors/retries are unavailable
  in the product report, never inferred from output text or exit code; the expected retry count is Claude-only.
- `retries`: canonical-input repeat immediately after an explicitly failed predecessor whose result precedes the new
  call, keyed by `(sessionId,agentId-or-main)`. `retryAmbiguous` equals counter `retry_ambiguous_order`.
- `unresolved`, `skipped`, `counters`: closed sparse maps below. Unresolved groups/steps emit **no event**, even observed.
- `byDay`: only days with emitted events; each value has `tokens`, `knownPico`, `events`. Unknown-price-only days have
  knownPico `"0"` while their events remain explicitly unknown in `cost`. Day sums equal the root populations.
- `complete`: false iff filtered unresolved counts are positive, a filtered emitted quality is not verified, or an
  import-wide usage-hiding skip occurs: line_too_long, invalid_utf8, malformed_json, truncated_line, bad_count,
  bad_timestamp, field_too_long, compressed_unsupported, file_read_error, codex_session_unidentified.
  Unknown prices, assumed5m, synthetic rows, ignored kinds, empty files, blank lines and non-JSONL files do not alter it.

## Counters, identity and precedence

`rowsRead` counts L1-produced lines in JSONL inputs, including unidentified-session files. A trailing newline does not
create a final empty line. An actual blank line does count. Non-JSONL and compressed files are skipped before reading;
empty JSONL files contribute zero lines.

`rowsRecognised = rowsRead - line/row skips - ignored_record_kind - codex_token_count_empty - remaining lines of
codex_session_unidentified files`. Remaining means not already line-skipped. File skips are not themselves line counts.
Inside an unidentified file apply only L2/L3/blank_line/L4; no record-level bad_count/bad_timestamp/ignored-kind code.
A valid duplicate/replay/unresolved row remains recognised. Recognised does not mean emitted or verified.

First line/row skip wins: L2 > L3 > blank_line > L4 > bad_count > bad_timestamp > field_too_long. A BOM is removed only
at the beginning of a file. Invalid complete JSON values (null, scalars, arrays) are malformed_json; records must be
non-array objects. An invalid final line is truncated_line only if it has no terminating newline.

Row-unit Claude counters count distinct row uuid values, with one-per-line fallback when absent. Exceptions:
claude_duplicate_rows, claude_duplicate_tool_use and claude_duplicate_turn count extra lines (n-1), including byte copies.
Codex duplicate_copy counts extra identity copies, including split files. Attribution tie-break I3 is total and independent
of selection/line order except the final path/line tie. Unknown prices have exactly one reason per event:
no_price_row > unsupported modifier > unsupported long context > rate_missing. Claude unresolved precedence is
claude_model_conflict > cache_split_mismatch > claude_conflicting_duplicates; no_identity and request_id_conflict are
row outcomes before final group resolution. Codex follows X10's first-applicable step outcome.

A missing requestId merges if its derived five buckets **and assumed5m flag**, plus model, match any logged row in
exactly one non-null-request group for that message id. This includes a logged nonterminal snapshot. An unlogged
snapshot matching no row is request_id_conflict; matching several request groups is also conflict. A raw cache-split
mismatch matches by the raw fields described in C2, and poisons its merged group under I2.

I6 filters events/unknown costs and event counters at the event timestamp; Claude groups at their earliest row;
Codex steps at the step timestamp; tools/turns at I3's selected timestamp. Row counters use their row timestamp.
All skips, line/file/session/import counters, rowsRead and rowsRecognised are import-wide. Baselines and retry
predecessors are computed before filtering. Copy counts are the explicit copy-variant exceptions.

Timestamp validation applies to every parsed record that is read, including unsupported kinds (I1). H10's timestamp-free
Claude `summary` therefore increments bad_timestamp, not ignored_record_kind. An unsupported kind with a valid timestamp
increments ignored_record_kind. Inside an unidentified Codex file the explicit file-level exception above still applies.

## Closed code vocabulary

Every name below is permitted only in its category. Count absent keys as zero. Trigger details are in the outer PLAN.md.

| Code | Category | Unit | Trigger rule |
|---|---|---|---|
| line_too_long | skip | line | L2: exceeds 8 MiB |
| invalid_utf8 | skip | line | L3: strict decoding fails |
| malformed_json | skip | line | L4/I1: malformed terminated JSON or non-record value |
| truncated_line | skip | line | L4: malformed final line without newline |
| bad_count | skip | line | N1/I1: missing required, negative, unsafe or noninteger count |
| bad_timestamp | skip | line | I1: missing/invalid RFC3339 instant, lowercase zone, leap second or -00:00 |
| field_too_long | skip | line | N1: identity string exceeds 4096 code points |
| blank_line | skip | line | L1: trim is empty |
| synthetic_or_error_row | skip | row | C5: synthetic model, or zero-usage API error |
| files_empty | skip | file | L5: empty JSONL file |
| compressed_unsupported | skip | file | intake: .zst |
| file_read_error | skip | file | intake: read failure |
| codex_session_unidentified | skip | file | X1: filename/meta identity not unique |
| ignored_non_jsonl | skip | file | intake: neither JSONL nor .zst |
| ignored_record_kind | counter | line | X1c/Claude intake: unsupported record kind |
| codex_token_count_empty | counter | line | I1: info null or missing total_token_usage |
| claude_duplicate_rows | counter | extra row line (n-1) | C2/C3/I2: every group, resolved or not |
| duplicate_copy | counter | extra Codex record copy | X1: identical structured identity |
| assumed5m | counter | emitted event | C1/I2: split absent and positive write total |
| request_id_missing | counter | row | C2: absent requestId |
| request_id_missing_merged | counter | row | C2: null-request row joins exactly one request group |
| synthetic_nonzero_usage | counter | row | C5: synthetic model with positive usage |
| turn_identity_missing | counter | row | C7: otherwise eligible user turn lacks uuid |
| claude_nonterminal_snapshot | counter | emitted event | C3(a): no terminal vector |
| claude_attribution_conflict | counter | group | C3b/I3: candidates differ in session or cwd |
| claude_duplicate_tool_use | counter | extra copy line | C6/I4: same tool_use id |
| claude_duplicate_turn | counter | extra copy line | C7/I4: same user uuid |
| claude_tool_status_conflict | counter | tool_use id | C6/I4: contradictory explicit flags |
| orphan_tool_result | counter | tool_use id | C6/I4: no call with matching id |
| codex_repeat_total | counter | step | X4/X10.5: zero delta, no X6 check |
| codex_last_delta_mismatch | counter | emitting step | X6/X10.8: last differs from computed delta |
| codex_embedded_parent_meta | counter | distinct record | X1b: meta id differs from file's own id |
| codex_replay_dropped | counter | dropped token_count | X8(c): proven leading token prefix |
| codex_replay_tool_dropped | counter | record (call or output) | X1d/I5: replayed parent tool identity |
| codex_replay_turn_dropped | counter | record | X1d/I5: replayed parent's turn_id |
| codex_fork_history_unverified | counter | session | I5: fork parent absent from selected own records |
| baseline_reset_assumed | counter | epoch start | X10.1/.3/.4: assumed valid baseline |
| retry_ambiguous_order | counter | candidate call | 4.5/I4: equal timestamp across files |
| rowsRead | counter | line | L1/I6: import-wide produced lines |
| rowsRecognised | counter | line | I1/4.9: subtraction definition above |
| cache_split_mismatch | unresolved | group | C1/I2: split sum differs from total |
| request_id_conflict | unresolved | row | C2: null request matches zero or several non-null groups |
| claude_conflicting_duplicates | unresolved | group | C3/I2: no unique terminal resolution |
| claude_model_conflict | unresolved | group | C3/I2: different models for one identity |
| no_identity | unresolved | row | C2/I1: missing message.id |
| codex_ambiguous_order | unresolved | step or tied set | X2/X10.2/.7: incomparable totals or exact context-switch time |
| codex_ambiguous_context | unresolved | step | X3/X10.7: tied differing context remains ambiguous |
| codex_cached_exceeds_input | unresolved | step | X5/X10.6: delta cached exceeds delta input |
| codex_cache_write_unmodeled | unresolved | step | X5b/X10.6: positive cache-write delta |
| codex_reasoning_exceeds_output | unresolved | step | X5/X10.6: delta reasoning exceeds delta output |
| codex_total_regressed | unresolved | step | X7/X10.4: decreasing component |
| codex_fork_unproven_prefix | unresolved | step | X8(d): inherited fork start without proven prefix |
| codex_inherited_start | unresolved | step | X8(b)/(d): fresh-meta first last differs from total |
| codex_session_meta_missing | unresolved | step | X8(d): no meta or self-proving zero start |
| metadata_cap_reached | unresolved | import (0/1) | 4.7: retained entry cap |
| no_price_row | unknown-price | emitted event | P2: exact model has no row in force |
| tier_unsupported | unknown-price | emitted event | P4: modifier, ambiguous Codex tier or prompt cap unsupported |
| rate_missing | unknown-price | emitted event | P4: nonzero bucket lacks rate |

The JSON Schema checks shape and closed keys. Cross-field sums, calendar validity, timezone validity, price validity,
input hashes and trap-to-scored-field coverage require the M4 checker and independent worksheet review; schema validation
alone is not an accounting proof. M0 inspected these relations statically without running product code.
