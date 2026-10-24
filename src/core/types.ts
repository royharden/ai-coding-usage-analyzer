/** Safe retained metadata only. No prompt, reply, tool argument or raw record fields. */
export type Agent = 'claude' | 'codex';
export type Quality = 'verified' | 'observed_snapshot' | 'observed_epoch';
export interface SourceRef { fileId: string; line: number }
/** Import-local tie-break material. Never copied into an exported report. */
export interface SourceLocation { sourceRef: SourceRef; relativePath: string }
export interface Modifiers { serviceTier?: string; speed?: string; inferenceGeo?: string; tierAmbiguous?: boolean; invalidModifier?: boolean }
export interface Buckets { input: bigint; output: bigint; cacheWrite5m: bigint; cacheWrite1h: bigint; cacheRead: bigint }
export interface Attribution extends SourceLocation {
  tsMs: number; sessionId: string; projectKey: string; sidechain: boolean; agentId?: string; modifiers: Modifiers;
}
export interface UsageEvent extends Buckets {
  agent: Agent; sessionId: string; projectKey: string; model: string; tsMs: number;
  sidechain: boolean; assumed5m: boolean; quality: Quality; observedEpoch: number;
  modifiers: Modifiers; sourceRef: SourceRef;
}
/** Transient retry metadata is explicitly omitted by M2's Report allowlist. */
export interface ToolFact {
  agent: Agent; sessionId: string; agentId?: string; callId: string; name: string; tsMs: number;
  sourceRef: SourceRef; status: 'error' | 'ok' | 'unknown'; inputHash?: string;
  resultPosition?: { tsMs: number; sourceRef: SourceRef };
}
export interface TurnFact { agent: Agent; sessionId: string; turnId: string; tsMs: number; sourceRef: SourceRef }
export const skipCodes = ['line_too_long', 'invalid_utf8', 'malformed_json', 'truncated_line', 'bad_count',
  'bad_timestamp', 'field_too_long', 'blank_line', 'synthetic_or_error_row', 'files_empty',
  'compressed_unsupported', 'file_read_error', 'codex_session_unidentified', 'ignored_non_jsonl'] as const;
export const counterCodes = ['ignored_record_kind', 'codex_token_count_empty', 'claude_duplicate_rows', 'duplicate_copy',
  'assumed5m', 'request_id_missing', 'request_id_missing_merged', 'synthetic_nonzero_usage', 'turn_identity_missing',
  'claude_nonterminal_snapshot', 'claude_attribution_conflict', 'claude_duplicate_tool_use', 'claude_duplicate_turn',
  'claude_tool_status_conflict', 'orphan_tool_result', 'codex_repeat_total', 'codex_last_delta_mismatch',
  'codex_embedded_parent_meta', 'codex_replay_dropped', 'codex_replay_tool_dropped', 'codex_replay_turn_dropped',
  'codex_fork_history_unverified', 'baseline_reset_assumed', 'retry_ambiguous_order', 'rowsRead', 'rowsRecognised'] as const;
export const unresolvedCodes = ['cache_split_mismatch', 'request_id_conflict', 'claude_conflicting_duplicates',
  'claude_model_conflict', 'no_identity', 'codex_ambiguous_order', 'codex_ambiguous_context',
  'codex_cached_exceeds_input', 'codex_cache_write_unmodeled', 'codex_reasoning_exceeds_output', 'codex_total_regressed',
  'codex_fork_unproven_prefix', 'codex_inherited_start', 'codex_session_meta_missing', 'metadata_cap_reached'] as const;
export type SkipCode = typeof skipCodes[number];
export type CounterCode = typeof counterCodes[number];
export type UnresolvedCode = typeof unresolvedCodes[number];
export type Diagnostic = ({ category: 'skip'; code: SkipCode } | { category: 'counter'; code: CounterCode } |
  { category: 'unresolved'; code: UnresolvedCode }) & {
  count: number;
  /** undefined means import-wide, even when evidence has a timestamp. */
  tsMs?: number; sourceRef?: SourceRef;
};
export interface RecognisedTimestamp { agent: Agent; sessionId: string; tsMs: number }
export interface Reconciled {
  events: UsageEvent[]; tools: ToolFact[]; turns: TurnFact[]; diagnostics: Diagnostic[];
  timestamps: RecognisedTimestamp[];
}
export type UnknownPriceReason = 'no_price_row' | 'tier_unsupported' | 'rate_missing';
export type Cost = { kind: 'known'; pico: bigint } | { kind: 'unknown'; reason: UnknownPriceReason };
export const bucketNames = ['input', 'output', 'cacheWrite5m', 'cacheWrite1h', 'cacheRead'] as const;
export function zeroBuckets(): Buckets { return { input: 0n, output: 0n, cacheWrite5m: 0n, cacheWrite1h: 0n, cacheRead: 0n }; }
export function emptyReconciled(): Reconciled { return { events: [], tools: [], turns: [], diagnostics: [], timestamps: [] }; }

export interface AgentCounts { claude: number; codex: number }
export interface QualityCounts { verified: number; observed_snapshot: number; observed_epoch: number }
export interface CostSummary {
  knownPico: bigint; knownByQuality: Record<Quality, bigint>; unknownPriceTokens: Buckets;
  unknownPriceEvents: { total: number; byReason: Map<UnknownPriceReason, number>; byModel: Map<string, number> };
  complete: boolean;
}
export interface GroupRow {
  key: string; label: string; tokens: Buckets; knownPico: bigint; unknownPriceEvents: number;
  events: number; byQuality: QualityCounts;
}
export interface Groupings { day: GroupRow[]; project: GroupRow[]; session: GroupRow[]; model: GroupRow[]; agent: GroupRow[] }
export type MetricValue = { kind: 'count'; value: number } | { kind: 'tokens' | 'money'; value: bigint } |
  { kind: 'ratio'; numerator: bigint; denominator: bigint } | { kind: 'coverage'; known: number; total: number } |
  { kind: 'unavailable'; value: 'not available' };
export interface SessionDuration { agent: Agent; sessionId: string; firstMs: number; lastMs: number; durationMs: number; label: 'within filter' }
export interface CheckedRecap { text: string; spans: { start: number; end: number; metricId: string }[] }
export type RecapStatus = { ok: true } | { ok: false; reason: string };
/** Report owns only safe aggregates. It contains neither raw events/tools nor retry hashes or default project paths. */
export interface Report {
  schema: 's22-report/1';
  metadata: { tz: string; since: string | null; until: string | null; priceTableDigest: string;
    priceTableSchema: 'pricetable/1'; parserSchema: 's22-parser/1'; fullPaths: boolean; bytesRead: number; filesRead: number };
  complete: boolean; tokens: Buckets; tokensByQuality: Record<Quality, Buckets>; cost: CostSummary;
  cacheHit: { numerator: bigint; denominator: bigint; display: string };
  events: { total: number; byQuality: QualityCounts; byAgent: AgentCounts }; modelCalls: number;
  turns: AgentCounts; tools: { total: number; byName: Map<string, number>; byMcpServer: Map<string, number> };
  toolResults: { error: number; ok: number; unknown: number }; retries: number; retryAmbiguous: number;
  errorRate: { claude: { numerator: number; denominator: number; display: string; coverage: string }; codex: 'not available' };
  codexRetries: 'not available'; sessionDurations: SessionDuration[]; groupings: Groupings;
  skipped: Map<SkipCode, number>; unresolved: Map<UnresolvedCode, number>; counters: Map<CounterCode, number>;
  evidence: { category: Diagnostic['category']; code: Diagnostic['code']; sourceRef: SourceRef }[];
  metricTable: Map<string, MetricValue>;
  /** The serializer independently verifies this candidate before projecting it. */
  recap?: CheckedRecap;
  recapStatus: RecapStatus;
}
