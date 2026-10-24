import type { Diagnostic } from './types';
export const MAX_LINE_BYTES = 8 * 1024 * 1024;
export const MAX_IDENTITY_CODEPOINTS = 4096;
export const MAX_METADATA_ENTRIES = 1_000_000;
export const MAX_EVIDENCE_PER_REASON = 100;
export const DISPLAY_CHARACTERS = 200;

// rule N1
export function identityTooLong(values: readonly unknown[]): boolean {
  return values.some(value => typeof value === 'string' && [...value].length > MAX_IDENTITY_CODEPOINTS);
}
/** Shared reservation object, passed through all parsers and reconciliation maps. */
export class MetadataBudget {
  private used = 0;
  private reported = false;
  constructor(readonly maximum = MAX_METADATA_ENTRIES) {
    if (!Number.isSafeInteger(maximum) || maximum < 0) throw new Error('Invalid metadata cap');
  }
  // rule 4.7
  reserve(entries = 1): boolean {
    if (this.used + entries > this.maximum) return false;
    this.used += entries;
    return true;
  }
  release(entries = 1): void { this.used = Math.max(0, this.used - entries); }
  diagnostic(): Diagnostic[] {
    if (this.reported) return [];
    this.reported = true;
    return [{ category: 'unresolved', code: 'metadata_cap_reached', count: 1 }];
  }
}
