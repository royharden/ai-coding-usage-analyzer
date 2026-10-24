import { constants } from 'node:fs';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';
import type { InputSource } from '../core/analyze';
import type { Diagnostic } from '../core/types';
import type { InputRoot } from '../cli/args';
import { isWithin } from './outGuard';

export interface WalkResult { sources: InputSource[]; diagnostics: Diagnostic[]; totalBytes: number }
const fileFailure = (): Diagnostic => ({ category: 'skip', code: 'file_read_error', count: 1 });
function missing(error: unknown): boolean { return error instanceof Error && 'code' in error && error.code === 'ENOENT'; }

/** Plan 4.7: metadata-only discovery; no file contents are opened before analyze's size check. */
export async function walkInputs(roots: readonly InputRoot[]): Promise<WalkResult> {
  const output: WalkResult = { sources: [], diagnostics: [], totalBytes: 0 };
  const failures = new Map<string, Diagnostic>();
  const add = (diagnostic: Diagnostic) => {
    const previous = failures.get(diagnostic.code);
    if (previous) previous.count += diagnostic.count;
    else { failures.set(diagnostic.code, diagnostic); output.diagnostics.push(diagnostic); }
  };
  const seen = new Set<string>();
  for (const input of roots) {
    let root: string;
    try {
      const info = await lstat(resolve(input.path));
      // All links, including explicit link roots, are skipped; the CLI help discloses this policy.
      if (info.isSymbolicLink() || !info.isDirectory()) { add(fileFailure()); continue; }
      root = await realpath(resolve(input.path));
    } catch (error) { if (!input.optional || !missing(error)) add(fileFailure()); continue; }
    const pending = [root];
    while (pending.length > 0) {
      const directory = pending.pop();
      if (!directory) break;
      let entries: string[];
      try {
        const info = await lstat(directory);
        if (info.isSymbolicLink() || !info.isDirectory() || !isWithin(root, await realpath(directory))) { add(fileFailure()); continue; }
        entries = (await readdir(directory)).sort();
      } catch { add(fileFailure()); continue; }
      for (const entry of entries) {
        const candidate = join(directory, entry);
        try {
          const info = await lstat(candidate);
          if (info.isSymbolicLink()) { add(fileFailure()); continue; }
          const actual = await realpath(candidate);
          if (!isWithin(root, actual)) { add(fileFailure()); continue; }
          if (info.isDirectory()) { pending.push(actual); continue; }
          if (!info.isFile()) continue;
          const lowerName = entry.toLowerCase();
          if (!lowerName.endsWith('.jsonl') && !lowerName.endsWith('.zst')) {
            add({ category: 'skip', code: 'ignored_non_jsonl', count: 1 }); continue;
          }
          const identity = `${input.agent}\u0000${actual}`;
          if (seen.has(identity)) continue;
          seen.add(identity);
          const fileId = `f${output.sources.length + 1}`;
          // Intake paths stay transient. Errors expose only fixed reason codes, never actual paths.
          output.sources.push({ agent: input.agent, fileId, name: basename(actual), relativePath: relative(root, actual), size: info.size,
            read: async function* () {
              const current = await lstat(actual);
              if (current.isSymbolicLink() || !current.isFile() || !isWithin(root, await realpath(actual))) throw new Error('Input changed during discovery.');
              const handle = await open(actual, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
              try {
                const opened = await handle.stat();
                if (!opened.isFile() || opened.dev !== info.dev || opened.ino !== info.ino) throw new Error('Input changed during discovery.');
                const buffer = new Uint8Array(64 * 1024);
                for (;;) {
                  const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
                  if (bytesRead === 0) break;
                  yield buffer.slice(0, bytesRead);
                }
              } finally { await handle.close(); }
            } });
          output.totalBytes += info.size;
        } catch { add(fileFailure()); }
      }
    }
  }
  return output;
}
