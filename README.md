# AI Coding Usage Analyzer

A local transcript accountant for Claude Code and Codex: five separate token buckets, dated cost estimates,
cache behavior, tool mix, errors and narrowly defined retries. React + TypeScript + Vite and a Node CLI share one pure core.

**Source construction is complete and statically reviewed. Installation, typechecking, lint, tests, evaluation,
builds, demo execution and browser behavior have never been run in this construction phase.** There is no lockfile yet.
This is source prepared for activation, not a validated release.

## The narrow claim

The intended measurable result is exact equality with hand-computed synthetic answers for token buckets, cost and
behavior populations. There is no tolerance. The committed instrument contains 24 dev fixtures and 10 independently
authored, frozen held-out fixtures; no score has been measured. A real naive-sum implementation is a deliberately
incorrect negative control, not evidence that this app outperforms existing tools. External comparison is `not measured`
until the user supplies pinned-tool output.

Token reports are a crowded category. This project focuses on a checkable accounting corpus, explicit uncertainty,
and a deterministic recap whose numeric spans are checked. It is not billing reconciliation or a claim about accuracy
on arbitrary real transcripts. There is no model, so there is nothing to mock and no model service to configure.

## Implemented source

- Streaming readers and cross-file Claude dedupe/Codex cumulative reconciliation, with skip and unresolved reasons.
- BigInt token sums and pico-USD costs, dated exact-model rates, and independent usage/price completeness.
- Day, project, session, model and agent groupings; cache hit rate, durations, MCP mix, explicit error coverage and retries.
- Browser folder/file selection, compatibility fallbacks, worker processing, five tabs, diagnostics, checked recap and
  local JSON/CSV/Markdown downloads. Reset/cancel terminates the worker and clears retained state.
- A read-only CLI with civil-day/timezone filters, size limits, conservative link refusal and guarded exclusive output.
- Manual fixture worksheets, integrity tooling, metamorphic test sources, evaluation/negative control and a fixture-only demo.

Unknown-priced events retain their tokens and are excluded from the known cost subtotal. Unresolved usage is never
summed. Observed snapshots/epochs remain visible and make usage incomplete. **The shipped production price table has
zero rows:** real-log costs are unknown until independently verified rates are supplied. The synthetic test table is
only an arithmetic oracle, never a vendor pricing source.

## Activate and validate later

The commands below are pending owner actions after the source-only restriction is closed. Run them from this repository root.

```text
npm install
npm run typecheck
npm run lint
npm test
npm run build
npm test -- tests/static/distUrls.test.ts
npm run check-fixtures
npm run eval
npm run demo
```

Commit the generated `package-lock.json` after installation; subsequent installs can use `npm ci`. Declared runtime is
Node >=20.11. Syntax inspection used Node 24; minimum-runtime compatibility remains unverified. The complete activation
sequence and platform checks are in [DEFERRED-VALIDATION.md](docs/DEFERRED-VALIDATION.md).

Held-out evaluation is separate: independently re-derive its arithmetic and verify the freeze first, then explicitly run
`npm run check-fixtures -- --heldout` and authorize the first `npm run eval -- --heldout`. The immutable first attempt/score
and append-only ledger are retained; later attempts are diagnostic. Never tune on held-out results. A rule/frozen-input
change needs a new independently authored edition.

## CLI and browser

After activation, this fixture command produces a JSON report using the synthetic rates:

```text
npm run analyze -- --claude fixtures/dev/D01/logs/claude --prices fixtures/prices.test.json --tz UTC --format json --out d01-report.json
```

Output parents must exist; existing output files are refused. An absent agent flag scans nothing for that agent. A bare
`--claude` uses its home default; bare `--codex` uses sessions plus optional archived sessions. Compressed `.zst` archives
are diagnosed and skipped. Other flags are `--since`, `--until`, `--format table|json|csv|md`, `--full-paths`, and
`--allow-large`. Filters are inclusive civil days in the printed timezone; deltas/retry predecessors are computed first.

For the browser, build then launch `npm run preview` in a top-level Chrome/Edge tab. Choose the same fixture's `logs`
folder and select `fixtures/prices.test.json` using **Local price table JSON**. Match that fixture's timezone and filters.
Use Auto source detection or explicitly choose Claude/Codex for renamed files. The Bolt iframe may require the folder/file
input fallback. Browser/CLI parity and the five-tab journey remain pending runtime checks.

Up to 500 MB is accepted; above that through 2,000 MB requires deliberate confirmation, and above 2,000 MB is refused.
Actual streamed bytes are checked again. The provisional metadata cap yields a visible partial report, not invented totals.

## Privacy and outputs

No database, account, telemetry, model SDK or persistent log store exists in the source. Files are explicitly selected;
the worker keeps accounting metadata, not prompt/reply text. Retry hashes are transient and never serialized. Reports retain
model/tool/session identifiers and project basenames; full logged CWD is opt-in. CSV defangs spreadsheet formulas and
Markdown escapes untrusted markup. JSON keeps exact decimal strings for BigInt values.

The intended built-app guarantee is no outbound or data-bearing request after page load. It still requires the documented
network observation; static scans are not a runtime privacy proof. Dev-server HMR is excluded, and a hosted editor can add
platform traffic. The analyzer is read-only on inputs by construction; report export is an explicit user action. Evaluation
tooling writes results/ledger files and the declared generated README block, without modifying transcript fixtures.

## Evaluation status

This generated block mirrors [results/results.md](results/results.md). An executed evaluator refreshes it automatically;
source inspection and hashing never manufacture scores.

<!-- evaluation-results:start -->

### Evaluation results

not yet run

The analyzer, naive negative control, fixture checks, metamorphic tests and held-out evaluation have not been executed. Source construction, JSON parsing and file hashing are not scores. No model calls.

At activation, `npm run eval` scores dev only and writes this file plus `results.jsonl`, with exact per-field differences, effective fixture options, manifest seed/freeze date/file hashes, manifest SHA-256 and local code commit. The naive sum is an intentionally incorrect negative control and supports token-bucket/known-cost comparisons only; it is not evidence of superiority.

`npm run eval -- --heldout` is explicit. It appends each attempt to `results/heldout-runs.jsonl` and retains an exclusive first-attempt record and immutable first score under the frozen held-out identity. Later attempts are diagnostic only and cannot overwrite that score. A failed initial attempt remains recorded. Dev-only manifest refreshes do not reset the frozen identity. Never tune the analyzer on held-out results.

<!-- evaluation-results:end -->

## Further reference

- [Accounting limits](docs/LIMITATIONS.md), [price-table contract](docs/PRICETABLE.md), [metric definitions](docs/METRICS.md).
- [Manual dev worksheet](docs/oracle-worksheet.md), [trap coverage](docs/TRAPS.md), [expected schema](docs/EXPECTED-SCHEMA.md).
- [Dev fixture options](docs/FIXTURE-OPTIONS.md), [supplied-tool comparison](docs/CROSSCHECK.md).
- [Bolt inspection handoff](BOLT-HANDOFF.md). No remote, push, hosting or backend provisioning has occurred.
