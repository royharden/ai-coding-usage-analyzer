import { webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createBrowserPlatform } from '../../src/web/platform';

describe('browser platform injection', () => {
  it('rejects invalid UTF-8 and preserves BOM for the shared line reader (L3)', () => {
    const platform = createBrowserPlatform(webcrypto.subtle as unknown as SubtleCrypto);
    expect(() => platform.decodeUtf8(new Uint8Array([0xc3, 0x28]))).toThrow();
    expect(platform.decodeUtf8(new Uint8Array([0xef, 0xbb, 0xbf, 0x61]))).toBe('\ufeffa');
  });
  it('uses injected SHA-256 with exact lowercase digest', async () => {
    expect(await createBrowserPlatform(webcrypto.subtle as unknown as SubtleCrypto).sha256('abc'))
      .toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
