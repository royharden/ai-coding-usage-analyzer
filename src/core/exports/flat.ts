/** Flatten only an already allowlisted serialization. JSON paths keep hostile keys unambiguous. */
export function flatFields(value: unknown, path: string[] = []): [string, string][] {
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) => flatFields(child, [...path, key]));
  }
  return [[JSON.stringify(path), value === null ? 'null' : String(value)]];
}
