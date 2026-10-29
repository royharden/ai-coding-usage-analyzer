import type { Cost } from './types';

const PICO_PER_DISPLAY_UNIT = 100_000_000n;
const DISPLAY_UNITS_PER_USD = 10_000n;

/** Round an aggregate once, half-up, without converting money to number. */
// rule P5
export function formatUsd(value: Cost | bigint): string {
  if (typeof value !== 'bigint' && value.kind === 'unknown') return 'unknown';
  const pico = typeof value === 'bigint' ? value : value.pico;
  if (pico < 0n) throw new RangeError('Cost must be non-negative');
  if (pico > 0n && pico < PICO_PER_DISPLAY_UNIT / 2n) return '< $0.0001';
  const rounded = (pico + PICO_PER_DISPLAY_UNIT / 2n) / PICO_PER_DISPLAY_UNIT;
  const dollars = rounded / DISPLAY_UNITS_PER_USD;
  const decimals = (rounded % DISPLAY_UNITS_PER_USD).toString().padStart(4, '0');
  return `$${dollars.toString()}.${decimals}`;
}
