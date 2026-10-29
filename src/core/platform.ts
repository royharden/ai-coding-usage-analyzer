/** Host adapters must use fatal UTF-8 decoding preserving BOM (ignoreBOM:true), and SHA-256. */
export interface Platform {
  decodeUtf8(bytes: Uint8Array): string;
  sha256(text: string): Promise<string>;
}

/** Stable scalar encoding and recursively sorted object keys; consumed transiently. */
export function canonicalInput(value: unknown): string {
  // An explicit stack avoids call-stack overflow for deeply nested but valid JSON.
  const stack: ({ value: unknown } | { literal: string })[] = [{ value }];
  const output: string[] = [];
  while (stack.length > 0) {
    const item = stack.pop();
    if (!item) break;
    if ('literal' in item) { output.push(item.literal); continue; }
    const current = item.value;
    if (current === null) { output.push('null'); continue; }
    if (typeof current === 'string' || typeof current === 'boolean' || (typeof current === 'number' && Number.isFinite(current))) {
      output.push(JSON.stringify(current)); continue;
    }
    if (Array.isArray(current)) {
      output.push('['); stack.push({ literal: ']' });
      for (let index = current.length - 1; index >= 0; index -= 1) {
        stack.push({ value: current[index] });
        if (index > 0) stack.push({ literal: ',' });
      }
      continue;
    }
    if (typeof current === 'object') {
      const object = current as Record<string, unknown>, keys = Object.keys(object).sort();
      output.push('{'); stack.push({ literal: '}' });
      for (let index = keys.length - 1; index >= 0; index -= 1) {
        const key = keys[index];
        if (key === undefined) continue;
        stack.push({ value: object[key] }); stack.push({ literal: `${JSON.stringify(key)}:` });
        if (index > 0) stack.push({ literal: ',' });
      }
      continue;
    }
    throw new Error('Tool input is not JSON');
  }
  return output.join('');
}
