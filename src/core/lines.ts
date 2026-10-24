import type { Platform } from './platform';
import type { Diagnostic, SourceRef } from './types';
import { MAX_LINE_BYTES } from './limits';

export type JsonLine = { kind: 'record'; value: Record<string, unknown>; sourceRef: SourceRef } |
  { kind: 'skip'; diagnostic: Diagnostic; sourceRef: SourceRef };
export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

/** L1-L5: retain at most limit bytes, discard an overlong remainder up to LF. */
export async function* readJsonLines(chunks: AsyncIterable<Uint8Array>, fileId: string, platform: Platform,
  limit = MAX_LINE_BYTES): AsyncGenerator<JsonLine> {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('Invalid line limit');
  let buffer = new Uint8Array(Math.min(limit, 4096));
  let length = 0, overlong = false, line = 0, seenBytes = false;
  function finish(terminated: boolean): JsonLine {
    line += 1;
    const sourceRef = { fileId, line };
    const skip = (code: 'line_too_long' | 'invalid_utf8' | 'blank_line' | 'malformed_json' | 'truncated_line'): JsonLine =>
      ({ kind: 'skip', sourceRef, diagnostic: { category: 'skip', code, count: 1, sourceRef } });
    // rule L2
    if (overlong) return skip('line_too_long');
    let text: string;
    try { text = platform.decodeUtf8(buffer.subarray(0, length)); } catch { return skip('invalid_utf8'); } // rule L3
    // rule L1
    if (line === 1 && text.startsWith('\uFEFF')) text = text.slice(1);
    if (text.endsWith('\r')) text = text.slice(0, -1);
    if (text.trim() === '') return skip('blank_line');
    try {
      const value = asRecord(JSON.parse(text) as unknown);
      if (!value) return skip('malformed_json');
      return { kind: 'record', value, sourceRef };
    } catch { return skip(terminated ? 'malformed_json' : 'truncated_line'); } // rule L4
  }
  for await (const chunk of chunks) {
    if (chunk.length > 0) seenBytes = true;
    for (const byte of chunk) {
      if (byte === 10) {
        yield finish(true);
        length = 0; overlong = false;
      } else if (!overlong) {
        if (length === limit) { overlong = true; length = 0; }
        else {
          if (length === buffer.length) {
            const grown = new Uint8Array(Math.min(limit, buffer.length * 2));
            grown.set(buffer); buffer = grown;
          }
          buffer[length++] = byte;
        }
      }
    }
  }
  if (length > 0 || overlong) yield finish(false);
  // rule L5
  if (!seenBytes) {
    const sourceRef = { fileId, line: 0 };
    yield { kind: 'skip', sourceRef, diagnostic: { category: 'skip', code: 'files_empty', count: 1, sourceRef } };
  }
}
