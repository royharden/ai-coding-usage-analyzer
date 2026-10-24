import { formatUsd } from '../money';
import { serializeReport } from '../serialize';
import type { Report } from '../types';
import { flatFields } from './flat';

// rule 4.7: no raw HTML or log-controlled Markdown syntax; cells remain on one line.
export function escapeMarkdown(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/[\r\n]/g, ' ').replace(/[|`*_\[\]<>#]/g, '\\$&');
}

// rule P5 / rule I7
export function toMarkdown(report: Report): string {
  const safe = serializeReport(report);
  const lines = ['# AI coding usage report', '',
    `Timezone: ${escapeMarkdown(safe.metadata.tz)}`,
    `Filter: ${escapeMarkdown(safe.metadata.since ?? 'unbounded')} through ${escapeMarkdown(safe.metadata.until ?? 'unbounded')}`,
    `Price-table SHA-256: ${escapeMarkdown(safe.metadata.priceTableDigest)}`,
    `Usage complete: ${safe.complete}; price coverage complete: ${safe.cost.complete}`, '',
    `Known cost: ${escapeMarkdown(formatUsd(BigInt(safe.cost.knownPico)))}`,
    `Exact known cost (pico-USD): ${safe.cost.knownPico}`,
    `Unknown-price events: ${safe.cost.unknownPriceEvents.total}. Unknown cost is excluded from the known subtotal.`, '',
    '| Input | Output | Cache write 5m | Cache write 1h | Cache read | Events |',
    '| ---: | ---: | ---: | ---: | ---: | ---: |',
    `| ${safe.tokens.input} | ${safe.tokens.output} | ${safe.tokens.cacheWrite5m} | ${safe.tokens.cacheWrite1h} | ${safe.tokens.cacheRead} | ${safe.events.total} |`, ''];
  for (const [name, groups] of Object.entries(safe.groupings)) {
    lines.push(`## By ${name}`, '',
      '| Label | Input | Output | Write 5m | Write 1h | Read | Known pico-USD | Events | Unknown-price events |',
      '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
    for (const row of groups) lines.push(`| ${escapeMarkdown(row.label)} | ${row.tokens.input} | ${row.tokens.output} | ${row.tokens.cacheWrite5m} | ${row.tokens.cacheWrite1h} | ${row.tokens.cacheRead} | ${row.knownPico} | ${row.events} | ${row.unknownPriceEvents} |`);
    lines.push('');
  }
  lines.push('## Exact report fields', '', '| Field path | Value |', '| --- | --- |');
  for (const [name, value] of Object.entries(safe)) {
    if (name === 'groupings') continue;
    for (const [path, leaf] of flatFields(value, [name])) lines.push(`| ${escapeMarkdown(path)} | ${escapeMarkdown(leaf)} |`);
  }
  return lines.join('\n') + '\n';
}
