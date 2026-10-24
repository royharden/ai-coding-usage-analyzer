import type { Attribution, Modifiers } from './types';
export function text(value: unknown, fallback = ''): string { return typeof value === 'string' ? value : fallback; }
export function optionalText(value: unknown): string | undefined { return typeof value === 'string' && value !== '' ? value : undefined; }
/** Preserve unsupported type information without retaining a raw modifier value. */
export function modifierValue(value: unknown): string | undefined {
  return value === undefined || value === null || value === '' ? undefined :
    typeof value === 'string' ? value : '\u0000unsupported-modifier';
}
// rule N1
export function count(value: unknown, optional = false): bigint | undefined {
  if (value === undefined && optional) return 0n;
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : undefined;
}
export function compareText(a: string | undefined, b: string | undefined): number {
  return a === b ? 0 : a === undefined ? -1 : b === undefined ? 1 : a < b ? -1 : 1;
}
export function modifiers(value: Record<string, unknown>): Modifiers {
  const result: Modifiers = {};
  result.invalidModifier = [value.service_tier, value.speed, value.inference_geo]
    .some(item => item !== undefined && item !== null && typeof item !== 'string');
  const serviceTier = modifierValue(value.service_tier), speed = modifierValue(value.speed), inferenceGeo = modifierValue(value.inference_geo);
  if (serviceTier !== undefined) result.serviceTier = serviceTier;
  if (speed !== undefined) result.speed = speed;
  if (inferenceGeo !== undefined) result.inferenceGeo = inferenceGeo;
  return result;
}
// rule I3
export function compareAttribution(a: Attribution, b: Attribution): number {
  return a.tsMs - b.tsMs || compareText(a.sessionId, b.sessionId) || compareText(a.projectKey, b.projectKey) ||
    (a.sidechain === b.sidechain ? 0 : a.sidechain ? 1 : -1) ||
    compareText(a.modifiers.serviceTier, b.modifiers.serviceTier) || compareText(a.modifiers.speed, b.modifiers.speed) ||
    compareText(a.modifiers.inferenceGeo, b.modifiers.inferenceGeo) || compareText(a.agentId, b.agentId) ||
    compareText(a.relativePath, b.relativePath) || a.sourceRef.line - b.sourceRef.line;
}
