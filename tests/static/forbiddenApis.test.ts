import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(directory, entry.name))
    : entry.isFile() && /\.(?:[cm]?[jt]sx?|css)$/.test(entry.name) ? [join(directory, entry.name)] : []);
}
const forbidden = [
  /\bfetch\s*(?:\?\.)?\s*\(/, /\bXMLHttpRequest\b/, /\bWebSocket\b/, /\bEventSource\b/, /\bsendBeacon\b/,
  /\bimport\s*\(\s*['"`]\s*(?:https?:|\/\/|data:)/, /\bimportScripts\b/, /\bRTCPeerConnection\b/, /\bWebTransport\b/,
  /\blocalStorage\b/, /\bsessionStorage\b/, /\bindexedDB\b/, /\bdocument\s*(?:\.\s*cookie|\[\s*['"]cookie['"]\s*\])/,
  /\bnavigator\s*(?:\.\s*serviceWorker|\[\s*['"]serviceWorker['"]\s*\])/, /\bcaches\s*\./, /\bcookieStore\b/,
  /\bdangerouslySetInnerHTML\b/, /\b(?:innerHTML|outerHTML|insertAdjacentHTML|srcdoc)\b/, /\bdocument\s*\.\s*write(?:ln)?\s*\(/,
];

describe('4.7 source privacy and text-only rendering', () => {
  it('declares the exact build-only CSP, React plugin and module worker output', () => {
    const config = readFileSync(join(root, 'vite.config.ts'), 'utf8');
    expect(config).toContain("apply: 'build'"); expect(config).toContain('react()'); expect(config).toContain("format: 'es'");
    expect(config).toContain("default-src 'self'; connect-src 'none'; img-src 'self' data:; style-src 'self'; script-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'");
  });
  it('contains none of the forbidden network, persistence, service-worker or raw-HTML APIs', () => {
    const violations: string[] = [];
    for (const file of files(join(root, 'src'))) {
      const source = readFileSync(file, 'utf8');
      for (const pattern of forbidden) if (pattern.test(source)) violations.push(`${relative(root, file)}: ${pattern.source}`);
    }
    expect(violations).toEqual([]);
  });
  it('has no inline style attributes or remote resources in browser source and entry HTML', () => {
    for (const file of [...files(join(root, 'src', 'web')), join(root, 'index.html')]) {
      const source = readFileSync(file, 'utf8');
      expect(source, relative(root, file)).not.toMatch(/\bstyle\s*=/);
      expect(source, relative(root, file)).not.toMatch(/https?:\/\//);
    }
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    expect(html).not.toMatch(/<style\b/i);
    for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      expect(script[1]).toMatch(/\bsrc=["']\/src\/web\/main\.tsx["']/); expect(script[2]?.trim()).toBe('');
    }
  });
});
