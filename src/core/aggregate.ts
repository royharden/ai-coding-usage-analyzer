import { DISPLAY_CHARACTERS, MetadataBudget } from './limits';
import { priceEvent } from './prices';
import type { PriceTable } from './prices';
import { compareCivilDays, makeDayKey } from './time';
import { bucketNames, zeroBuckets } from './types';
import type { Buckets, CostSummary, Diagnostic, Groupings, GroupRow, Quality, QualityCounts, UsageEvent } from './types';

export function displayLabel(value: string): string { return [...value].slice(0, DISPLAY_CHARACTERS).join(''); }
export function emptyQualityCounts(): QualityCounts { return { verified: 0, observed_snapshot: 0, observed_epoch: 0 }; }
export function addBuckets(target: Buckets, source: Buckets): void { for (const key of bucketNames) target[key] += source[key]; }
function basename(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '');
  return trimmed.split(/[\\/]/).at(-1) || path || 'unknown';
}
/** Construct opaque ordinal project keys; raw cwd values live only in this local lookup. */
export function projectLabels(events: readonly UsageEvent[], fullPaths: boolean, budget = new MetadataBudget()): Map<string, { key: string; label: string }> {
  const paths = [...new Set(events.map(event => event.projectKey))].sort();
  const counts = new Map<string, number>(), usedLabels = new Set<string>();
  const result = new Map<string, { key: string; label: string }>();
  for (const [index, path] of paths.entries()) {
    if (!budget.reserve(3)) continue;
    const base = displayLabel(fullPaths ? path : basename(path));
    const numbered = (ordinal: number): string => {
      const suffix = ` #${ordinal}`;
      return [...base].slice(0, DISPLAY_CHARACTERS - suffix.length).join('') + suffix;
    };
    let ordinal = (counts.get(base) ?? 0) + 1, label = ordinal === 1 ? base : numbered(ordinal);
    while (usedLabels.has(label)) { ordinal += 1; label = numbered(ordinal); }
    counts.set(base, ordinal); usedLabels.add(label);
    result.set(path, { key: fullPaths ? path : `project-${index + 1}`, label });
  }
  return result;
}
export interface Aggregation {
  tokens: Buckets; tokensByQuality: Record<Quality, Buckets>; cost: CostSummary;
  events: { total: number; byQuality: QualityCounts; byAgent: { claude: number; codex: number } };
  groupings: Groupings; diagnostics: Diagnostic[];
}
// rule I6: caller supplies filtered events only; reconciliation always happened before this boundary.
export function aggregateEvents(events: readonly UsageEvent[], prices: PriceTable, tz: string, fullPaths = false,
  budget = new MetadataBudget()): Aggregation {
  const output: Aggregation = {
    tokens: zeroBuckets(), tokensByQuality: { verified: zeroBuckets(), observed_snapshot: zeroBuckets(), observed_epoch: zeroBuckets() },
    cost: { knownPico: 0n, knownByQuality: { verified: 0n, observed_snapshot: 0n, observed_epoch: 0n }, unknownPriceTokens: zeroBuckets(),
      unknownPriceEvents: { total: 0, byReason: new Map(), byModel: new Map() }, complete: true },
    events: { total: 0, byQuality: emptyQualityCounts(), byAgent: { claude: 0, codex: 0 } },
    groupings: { day: [], project: [], session: [], model: [], agent: [] }, diagnostics: [],
  };
  const maps = { day: new Map<string, GroupRow>(), project: new Map<string, GroupRow>(), session: new Map<string, GroupRow>(),
    model: new Map<string, GroupRow>(), agent: new Map<string, GroupRow>() };
  const labels = projectLabels(events, fullPaths, budget), day = makeDayKey(tz);
  if (labels.size < new Set(events.map(event => event.projectKey)).size) output.diagnostics.push(...budget.diagnostic());
  for (const event of events) {
    const project = labels.get(event.projectKey);
    if (!project) continue;
    const selections: [keyof Groupings, string, string][] = [
      ['day', day(event.tsMs), day(event.tsMs)], ['project', project.key, project.label],
      ['session', JSON.stringify([event.agent, event.sessionId]), displayLabel(`${event.agent}: ${event.sessionId}`)],
      ['model', event.model, displayLabel(event.model)], ['agent', event.agent, event.agent],
    ];
    const needed = selections.filter(([kind, key]) => !maps[kind].has(key)).length;
    const cost = priceEvent(event, prices);
    const unknownModelEntry = cost.kind === 'unknown' && !output.cost.unknownPriceEvents.byModel.has(event.model) ? 1 : 0;
    if (!budget.reserve(needed + unknownModelEntry)) { output.diagnostics.push(...budget.diagnostic()); continue; }
    addBuckets(output.tokens, event); addBuckets(output.tokensByQuality[event.quality], event);
    output.events.total += 1; output.events.byQuality[event.quality] += 1; output.events.byAgent[event.agent] += 1;
    if (cost.kind === 'known') {
      output.cost.knownPico += cost.pico; output.cost.knownByQuality[event.quality] += cost.pico;
    } else {
      output.cost.complete = false; addBuckets(output.cost.unknownPriceTokens, event);
      output.cost.unknownPriceEvents.total += 1;
      const reasons = output.cost.unknownPriceEvents.byReason, models = output.cost.unknownPriceEvents.byModel;
      reasons.set(cost.reason, (reasons.get(cost.reason) ?? 0) + 1); models.set(event.model, (models.get(event.model) ?? 0) + 1);
    }
    for (const [kind, key, label] of selections) {
      let row = maps[kind].get(key);
      if (!row) { row = { key, label, tokens: zeroBuckets(), knownPico: 0n, unknownPriceEvents: 0, events: 0, byQuality: emptyQualityCounts() }; maps[kind].set(key, row); }
      addBuckets(row.tokens, event); row.events += 1; row.byQuality[event.quality] += 1;
      if (cost.kind === 'known') row.knownPico += cost.pico; else row.unknownPriceEvents += 1;
    }
  }
  for (const kind of ['day', 'project', 'session', 'model', 'agent'] as const)
    output.groupings[kind] = [...maps[kind].values()].sort((a, b) => kind === 'day' ? compareCivilDays(a.key, b.key) : a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  return output;
}
