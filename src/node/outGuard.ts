import { lstat, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

export class OutputGuardError extends Error {}

export function isWithin(root: string, target: string): boolean {
  const suffix = relative(root, target);
  return suffix === '' || (!isAbsolute(suffix) && suffix !== '..' && !suffix.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`));
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

/** Resolve a missing target through its nearest existing ancestor, including junctions. */
export async function canonicalTarget(target: string): Promise<string> {
  let ancestor = resolve(target);
  const missing: string[] = [];
  for (;;) {
    try {
      await lstat(ancestor);
      return join(await realpath(ancestor), ...missing.reverse());
    } catch (error) {
      if (!isMissing(error)) throw new OutputGuardError('Cannot resolve the report destination safely.');
      const parent = dirname(ancestor);
      if (parent === ancestor) throw new OutputGuardError('Cannot resolve the report destination safely.');
      missing.push(relative(parent, ancestor));
      ancestor = parent;
    }
  }
}

/** Plan 4.7: both lexical and real locations must be outside every requested input root. */
export async function resolveOutputTarget(target: string, inputRoots: readonly string[]): Promise<string> {
  const lexical = resolve(target), physical = await canonicalTarget(target);
  for (const input of inputRoots) {
    const root = resolve(input), realRoot = await canonicalTarget(input);
    if (isWithin(root, lexical) || isWithin(realRoot, physical)) {
      throw new OutputGuardError('Report destination must be outside every input root.');
    }
  }
  try { await lstat(lexical); }
  catch (error) {
    if (isMissing(error)) return physical;
    throw new OutputGuardError('Cannot inspect the report destination safely.');
  }
  throw new OutputGuardError('Report destination already exists; choose a new file.');
}
