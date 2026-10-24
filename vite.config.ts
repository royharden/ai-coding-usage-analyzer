import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

export const BUILD_CSP = "default-src 'self'; connect-src 'none'; img-src 'self' data:; style-src 'self'; script-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";

/** rule 4.7: dev HMR is excluded; inject the restriction into built HTML only. */
function builtCsp(): Plugin {
  return { name: 's22-built-csp', apply: 'build', transformIndexHtml: {
    order: 'post', handler: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: BUILD_CSP }, injectTo: 'head-prepend' }],
  } };
}

export default defineConfig({ plugins: [react(), builtCsp()], worker: { format: 'es' } });
