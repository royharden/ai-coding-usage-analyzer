import { describe, expect, it } from 'vitest';
import { readJsonLines } from '../../src/core/lines';
import { platform } from './helpers';

async function read(bytes: Uint8Array, step = 1, limit?: number) {
  async function* chunks() { for (let offset = 0; offset < bytes.length; offset += step) yield bytes.subarray(offset, offset + step); }
  const output = [];
  for await (const line of readJsonLines(chunks(), 'f1', platform, limit)) output.push(line);
  return output;
}
const encode = (text: string) => new TextEncoder().encode(text);
describe('L1-L5 bounded streaming JSONL', () => {
  it('L1 strips a file BOM and one CR, preserves split multibyte UTF8, and avoids a trailing phantom line', async () => {
    const lines = await read(encode('\uFEFF{"word":"é"}\r\n\n{"ok":true}\n'));
    expect(lines.map(line => line.kind === 'record' ? line.value : line.diagnostic.code)).toEqual([
      { word: 'é' }, 'blank_line', { ok: true },
    ]);
    expect(lines.map(line => line.sourceRef.line)).toEqual([1, 2, 3]);
  });
  it('L2 discards oversized bytes until LF and resumes with a valid next line; exact cap is accepted', async () => {
    const lines = await read(encode('xxxxxxxxxxxxxxxx\n{}\n'), 3, 2);
    expect(lines[0]?.kind === 'skip' && lines[0].diagnostic.code).toBe('line_too_long');
    expect(lines[1]?.kind).toBe('record');
    expect(await read(encode('{}'), 1, 2)).toMatchObject([{ kind: 'record', value: {} }]);
  });
  it('L2 wins over L3, and L3 uses strict UTF8 rather than replacement decoding', async () => {
    expect(await read(new Uint8Array([0xff, 0xff, 0xff, 10]), 1, 2)).toMatchObject([{ diagnostic: { code: 'line_too_long' } }]);
    expect(await read(new Uint8Array([0xff, 10, 123, 125]))).toMatchObject([
      { diagnostic: { code: 'invalid_utf8' } }, { kind: 'record' },
    ]);
  });
  it('L4 distinguishes parse failure at terminated and unterminated ends and keeps later valid lines', async () => {
    expect(await read(encode('broken\n{}\n{"unfinished":'))).toMatchObject([
      { diagnostic: { code: 'malformed_json' } }, { kind: 'record' }, { diagnostic: { code: 'truncated_line' } },
    ]);
  });
  it.each(['null', '[]', '42', 'true', '"scalar"'])('I1 non-record JSON %s is malformed with or without LF', async value => {
    for (const suffix of ['', '\n']) expect(await read(encode(value + suffix))).toMatchObject([{ diagnostic: { code: 'malformed_json' } }]);
  });
  it('L5 emits one file-unit skip with no produced line for an empty file', async () => {
    expect(await read(new Uint8Array())).toMatchObject([{ sourceRef: { line: 0 }, diagnostic: { code: 'files_empty' } }]);
  });
});
