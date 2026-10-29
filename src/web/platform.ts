import type { Platform } from '../core/platform';

/** Browser primitives are injected here; the accounting core has no browser globals. */
export function createBrowserPlatform(subtle: SubtleCrypto): Platform {
  return {
    // rule L3: preserve BOM for the shared line reader and reject malformed UTF-8.
    decodeUtf8(bytes) { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); },
    async sha256(text) {
      const bytes = new TextEncoder().encode(text);
      const digest = await subtle.digest('SHA-256', bytes);
      return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    },
  };
}
