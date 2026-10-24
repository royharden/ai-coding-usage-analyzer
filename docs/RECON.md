# Log format recon (M0)

Date: 2026-10-24. Done once, read-only, by the integrator before any parser or fixture existed.

Method: small scripts outside this repository walked a sample of the integrator's own local agent logs and printed only
JSON key paths, value types, aggregate counts and a whitelist of enum-like values (record kinds, `stop_reason`, model
ids). No prompt, reply, tool argument, path or identifier was printed, copied or committed. The scripts are not part of
this repository. Field names below are therefore observed, not guessed; the counts describe one person's logs on one
day and are not a claim about anyone else's.

## Claude Code

Sample: 930 JSONL files modified in the previous 10 days under `~/.claude/projects/**` (including
`<session>/subagents/agent-*.jsonl`), 172,372 assistant rows with usage. Entry point `claude-desktop`; models
`claude-opus-5-5`, `claude-sonnet-5-5`, `claude-fable-5-1`.

| Field | Observation | Used by rule |
|---|---|---|
| `message.usage.input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens` | present on every assistant row | C1 |
| `message.usage.cache_creation.ephemeral_5m_input_tokens` / `ephemeral_1h_input_tokens` | present on every row; split sum differs from `cache_creation_input_tokens` on 4 rows | C1 (`cache_split_mismatch`) |
| `message.usage.service_tier` | always `standard` | P4 |
| `message.usage.speed` | `standard` (159,047), absent (13,822), other/null (169, the synthetic rows) | P4 |
| `message.usage.inference_geo` | `not_available` (89,282), `global` (81,540), empty or other (2,216) | P4 |
| `message.usage.iterations[]`, `output_tokens_details.thinking_tokens`, `server_tool_use.*` | present; informational | not used |
| `message.id` | never missing | C2 |
| `requestId` (row level) | missing on 28 rows | C2 (`request_id_missing`) |
| `uuid`, `parentUuid`, `timestamp`, `sessionId`, `cwd`, `isSidechain`, `agentId` | present | C4, C7 |
| `message.stop_reason` | `tool_use`, `end_turn`, or null on streamed snapshots | C3 |
| `message.model == "<synthetic>"` | 169 rows | C5 |
| `isApiErrorMessage` | 144 rows | C5 |
| `message.content[].type` | `text`, `thinking`, `tool_use`, `tool_result` | C6 |
| `tool_result.is_error` | `true` / `false` present | C6 |

Grouping by `(message.id, requestId)`:
- 20,859 single-row keys; 50,659 multi-row keys; 2,828 keys span more than one file.
- 43,066 multi-row keys have one identical usage vector.
- 7,593 have differing vectors; in every one exactly one distinct vector carries a non-null `stop_reason`, and the vectors
  differ only in `output_tokens` (streamed snapshots). Confirms C3(b).
- 941 keys carry different `sessionId` values and 557 different `cwd` values across rows with identical usage and model
  (history copied into resumed or forked transcripts). No key has conflicting models. Motivates C3b.

## Codex

Sample: all 860 `rollout-*.jsonl` files under `~/.codex/sessions/**` (some statistics on a 300-file random sample).
Originator `codex-tui`, model `gpt-6.1-sol`.

| Field | Observation | Used by rule |
|---|---|---|
| top-level `type` | `session_meta`, `turn_context`, `event_msg`, `response_item`, `token_usage_record`, `world_state`, `inter_agent_communication_metadata` | X1c |
| `event_msg` with `payload.type = token_count`, `payload.info.total_token_usage` / `last_token_usage` | `{input_tokens, cached_input_tokens, output_tokens, reasoning_output_tokens, total_tokens, cache_write_input_tokens}` | X4–X6 |
| `total_tokens == input_tokens + output_tokens` | 36,521 of 36,521 sampled records | X5 (cached inside input, reasoning inside output) |
| `cache_write_input_tokens` | 0 in every sampled record | X5b |
| delta vs `last_token_usage` | equal on 35,831 steps, different on 2; 388 repeats; 0 regressions | X4, X6, X7 |
| `token_usage_record` (`usage`, `turn_token_usage`, `thread_token_usage`) | duplicates the same usage in another shape | X1c (ignored) |
| `session_meta.payload.id` | equals the uuid in the file name for the first `session_meta` | X1 |
| `session_meta.payload.forked_from_id` | present on 94 files | X8 |
| second `session_meta` in a fork file | 90 of 94 fork files; its `id` equals the first record's `forked_from_id` (the parent) | X1b |
| `session_meta.payload.parent_thread_id`, `source.subagent.thread_spawn.parent_thread_id` | on spawned subagent threads | informational |
| first `token_count` with `total_token_usage == last_token_usage` | 91 of 94 forks, all 213 sampled subagent threads; 3 forks start with an inherited total | X8(a), X8(d) |
| replayed `token_count` timestamped before the child's `session_meta` | 0 | X8(c) |
| fork replay of parent history (all 94 parents present in the sample) | child files repeat the parent's tool records (670 call ids) and `turn_context`s (118 turn ids) after the embedded parent `session_meta`, re-stamped with new timestamps, as one contiguous leading block; `token_count` vectors are **not** replayed (1 coincidental match in 7,748) | X1d, X8(c) |
| `token_count` with `info: null` | 0 seen | X1c |
| `turn_context.payload.model`, `cwd`, `turn_id` | present (no service tier here) | X3 |
| `event_msg` with `payload.type = thread_settings_applied`, `payload.thread_settings.service_tier` | `default` in every sampled session; the only place the Codex tier appears | P4 |
| `response_item` `function_call` / `custom_tool_call` and `*_output` with `call_id` | present | X9 |
| explicit tool error flag | none found (`item_completed` has `exit_code`, not used) | X9 (`not available`) |
| `~/.codex/archived_sessions/*.jsonl.zst` | zstd-compressed | intake: `compressed_unsupported` |

## Re-check at activation

Agent formats drift. At activation, re-run an equivalent key-shape check on the current agent versions and update this
file; a changed rule becomes a new fixture edition (see `docs/DEFERRED-VALIDATION.md`).
