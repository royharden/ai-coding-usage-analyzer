import { MAX_EVIDENCE_PER_REASON, MetadataBudget } from './limits';
import type { Diagnostic } from './types';

/** Fixed-vocabulary import counters are constant space; timed entries share the metadata cap. */
export class DiagnosticBag {
  readonly values: Diagnostic[] = [];
  private readonly wide = new Map<string, Diagnostic>();
  private readonly evidenceCounts = new Map<string, number>();
  constructor(private readonly budget: MetadataBudget) {}
  add(diagnostic: Diagnostic): void {
    const key = `${diagnostic.category}:${diagnostic.code}`;
    const previous = diagnostic.tsMs === undefined ? this.wide.get(key) : undefined;
    if (previous) { previous.count += diagnostic.count; return; }
    if (diagnostic.tsMs !== undefined && !this.budget.reserve()) { this.values.push(...this.budget.diagnostic()); return; }
    const evidence = this.evidenceCounts.get(key) ?? 0;
    const retained = { ...diagnostic, sourceRef: evidence < MAX_EVIDENCE_PER_REASON ? diagnostic.sourceRef : undefined };
    if (retained.sourceRef) this.evidenceCounts.set(key, evidence + 1);
    this.values.push(retained);
    if (retained.tsMs === undefined) this.wide.set(key, retained);
  }
  addAll(diagnostics: readonly Diagnostic[]): void { for (const diagnostic of diagnostics) this.add(diagnostic); }
}
