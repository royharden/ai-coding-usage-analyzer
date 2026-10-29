import { asRecord } from './lines';
import { identityTooLong, MetadataBudget } from './limits';
import { canonicalInput } from './platform';
import type { Platform } from './platform';
import { parseTimestamp } from './timestamp';
import { count, modifiers, optionalText, text } from './validation';
import type { Attribution, Buckets, CounterCode, Diagnostic, SourceLocation } from './types';

export interface ClaudeUsage extends Buckets {
  messageId?: string; requestId: string | null; model: string; terminal: boolean;
  assumed5m: boolean; splitMismatch: boolean; rawUsageKey: string;
}
export interface ClaudeTool { id: string; name: string; inputHash?: string }
export interface ClaudeResult { id: string; flag?: boolean }
export interface ClaudeRow extends Attribution {
  rowId: string; usage?: ClaudeUsage; tools: ClaudeTool[]; results: ClaudeResult[]; turnId?: string;
  rowCounters: CounterCode[]; syntheticSkip: boolean;
}
export interface ClaudeParseResult { row?: ClaudeRow; diagnostics: Diagnostic[] }

/** Transforms one transient JSON object into a bounded, content-free row. */
export async function parseClaudeRecord(record: Record<string, unknown>, location: SourceLocation,
  platform: Platform, budget = new MetadataBudget()): Promise<ClaudeParseResult> {
  const message = asRecord(record.message);
  const usage = asRecord(message?.usage);
  let parsedUsage: ClaudeUsage | undefined;
  let rawNonzero = false;
  const fail = (code: 'bad_count' | 'bad_timestamp' | 'field_too_long'): ClaudeParseResult => ({
    diagnostics: [{ category: 'skip', code, count: 1, sourceRef: location.sourceRef }],
  });
  // rule I1: counts precede timestamps; defaults apply only to absent optional fields.
  if (record.type === 'assistant' && message && message.usage !== undefined && !usage) return fail('bad_count');
  if (record.type === 'assistant' && usage) {
    const input = count(usage.input_tokens), output = count(usage.output_tokens);
    const cacheRead = count(usage.cache_read_input_tokens, true), total = count(usage.cache_creation_input_tokens, true);
    const splitPresent = usage.cache_creation !== undefined;
    const split = asRecord(usage.cache_creation);
    const w5 = splitPresent ? count(split?.ephemeral_5m_input_tokens, true) : total;
    const w1 = splitPresent ? count(split?.ephemeral_1h_input_tokens, true) : 0n;
    if (input === undefined || output === undefined || cacheRead === undefined || total === undefined ||
      w5 === undefined || w1 === undefined || (splitPresent && !split)) return fail('bad_count');
    rawNonzero = input + output + cacheRead + total + w5 + w1 > 0n;
    // rule C1
    parsedUsage = {
      input, output, cacheRead, cacheWrite5m: w5, cacheWrite1h: w1,
      messageId: optionalText(message?.id), requestId: optionalText(record.requestId) ?? null,
      model: text(message?.model, 'unknown'), terminal: message?.stop_reason !== undefined && message.stop_reason !== null,
      assumed5m: !splitPresent && total > 0n, splitMismatch: splitPresent && w5 + w1 !== total,
      // I2 raw matching retains bucket metadata only, never the record or content.
      rawUsageKey: JSON.stringify([input.toString(), output.toString(), cacheRead.toString(), total.toString(),
        splitPresent ? [w5.toString(), w1.toString()] : null]),
    };
  }
  // rule I1: validate even an ignored record before kind handling.
  const tsMs = parseTimestamp(record.timestamp);
  if (tsMs === undefined) return fail('bad_timestamp');
  const content = Array.isArray(message?.content) ? message.content : [];
  const parts = content.map(asRecord).filter((part): part is Record<string, unknown> => part !== undefined);
  const mods = modifiers(usage ?? {});
  // rule N1: identity fields only; prompt/tool argument content is never identity material.
  if (identityTooLong([record.uuid, record.sessionId, record.cwd, record.agentId, record.requestId, message?.id, message?.model,
    mods.serviceTier, mods.speed, mods.inferenceGeo, ...parts.flatMap(part => [part.id, part.tool_use_id, part.name])])) return fail('field_too_long');
  if (!budget.reserve()) return { diagnostics: budget.diagnostic() };
  const diagnostics: Diagnostic[] = [];
  const row: ClaudeRow = {
    ...location, tsMs, sessionId: text(record.sessionId, 'unknown'), projectKey: text(record.cwd, 'unknown'),
    sidechain: record.isSidechain === true, agentId: optionalText(record.agentId), modifiers: mods,
    rowId: optionalText(record.uuid) ? JSON.stringify(['uuid', record.uuid]) :
      JSON.stringify(['line', location.sourceRef.fileId, location.sourceRef.line]),
    tools: [], results: [], rowCounters: [], syntheticSkip: false,
  };
  if (parsedUsage) {
    // rule C5: skip before C1/C2 grouping, but count synthetic nonzero separately.
    const nonzero = rawNonzero;
    if (parsedUsage.model === '<synthetic>' || (record.isApiErrorMessage === true && !nonzero)) {
      row.syntheticSkip = true;
      if (parsedUsage.model === '<synthetic>' && nonzero) row.rowCounters.push('synthetic_nonzero_usage');
      return { row, diagnostics };
    }
    row.usage = parsedUsage;
    // rule C2
    if (parsedUsage.requestId === null) row.rowCounters.push('request_id_missing');
  }
  // rule C6: hash canonical input transiently, retain neither input nor canonical string.
  for (const part of parts) {
    if (part.type === 'tool_use' && optionalText(part.id)) {
      if (!budget.reserve()) { diagnostics.push(...budget.diagnostic()); continue; }
      const tool: ClaudeTool = { id: text(part.id), name: text(part.name, 'unknown') };
      if (part.input !== undefined) {
        // Unsupported JSON numbers (e.g. parsed 1e400) or a host hash failure do not lose usage/tools.
        // Missing hash means retry comparison is unavailable for this call, never a matching empty hash.
        try { tool.inputHash = await platform.sha256(canonicalInput(part.input)); } catch { /* omit transient hash */ }
      }
      row.tools.push(tool);
    } else if (part.type === 'tool_result' && optionalText(part.tool_use_id)) {
      if (!budget.reserve()) { diagnostics.push(...budget.diagnostic()); continue; }
      row.results.push({ id: text(part.tool_use_id), flag: typeof part.is_error === 'boolean' ? part.is_error : undefined });
    }
  }
  // rule C7
  const onlyResults = content.length > 0 && content.every(part => asRecord(part)?.type === 'tool_result');
  if (record.type === 'user' && record.isMeta !== true && !onlyResults) {
    row.turnId = optionalText(record.uuid);
    if (!row.turnId) row.rowCounters.push('turn_identity_missing');
  }
  const recognised = row.usage !== undefined || record.type === 'user' || row.tools.length > 0 || row.results.length > 0;
  if (!recognised) {
    budget.release();
    diagnostics.push({ category: 'counter', code: 'ignored_record_kind', count: 1, sourceRef: location.sourceRef });
    return { diagnostics };
  }
  return { row, diagnostics };
}
