import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const fixtures = fileURLToPath(new URL('../../fixtures/', import.meta.url));
function files(directory: string, frozen: boolean): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.isDirectory()) return entry.name === 'heldout' && !frozen ? [] : files(join(directory, entry.name), frozen);
    return entry.isFile() ? [join(directory, entry.name)] : [];
  });
}
function inspect(frozen: boolean): string[] {
  const violations: string[] = [];
  const patterns = [/\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}\b/, /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
    /\bgithub_pat_[A-Za-z0-9_]{20,}\b/, /\bAKIA[A-Z0-9]{16}\b/, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
    /\b(?:api[_-]?key|access[_-]?token|secret)\b["']?\s*[:=]\s*["'][A-Za-z0-9_/-]{20,}["']/i];
  for (const file of files(fixtures, frozen)) {
    const text = readFileSync(file, 'utf8');
    if (patterns.some(pattern => pattern.test(text))) violations.push(relative(fixtures, file));
    if (/(?:C:\\\\Users\\\\(?:Roy Harden|royha)|\/Users\/royharden|\/home\/royharden)/i.test(text)) violations.push(relative(fixtures, file));
  }
  return violations;
}
describe('synthetic-only fixture hygiene; never scores or tunes a fixture', () => {
  it('scans dev and public fixture metadata without opening the frozen split', () => expect(inspect(false)).toEqual([]));
  it.runIf(process.env.S22_SCAN_FROZEN_FIXTURES === '1')('independent activation reviewer scans frozen fixture secret shapes only', () => {
    expect(inspect(true)).toEqual([]);
  });
});
