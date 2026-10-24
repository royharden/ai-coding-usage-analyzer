import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';
import type { Platform } from '../core/platform';

/** rule L3: preserve BOM for the line reader, and reject malformed UTF-8. */
export const nodePlatform: Platform = {
  decodeUtf8: bytes => new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes),
  sha256: async text => createHash('sha256').update(text, 'utf8').digest('hex'),
};
