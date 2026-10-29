import { serializeReport } from '../serialize';
import type { Report } from '../types';
export { serializeReport, toFixturePopulations } from '../serialize';
export function toJson(report: Report): string { return `${JSON.stringify(serializeReport(report), null, 2)}\n`; }
