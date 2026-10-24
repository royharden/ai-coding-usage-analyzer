# Agent instructions: ai-coding-usage-analyzer

Local-only accountant for Claude Code and Codex transcripts. The one claim: on hand-computed synthetic fixtures every
token bucket, cost and behaviour count matches exactly (BigInt, zero tolerance).

- `src/core` is pure TypeScript (`tsconfig.core.json`: no DOM, no Node, no React). Platform needs are injected.
- Every accounting rule has an id (L*, N1, C*, X*, P*) tagged in code as `// rule <id>`; ids are defined in
  `docs/TRAPS.md` and the plan they came from. Change a rule only together with its fixtures, as a new fixture edition.
- Money is BigInt pico-USD; never `number`. Unknown price is never `$0`. Unresolved usage is never summed.
- No network, storage, telemetry or model calls anywhere in `src`; static tests enforce this.
- Fixtures are synthetic. Never commit real logs, paths, ids or anything key-shaped.
- `fixtures/heldout` is frozen (hashes in `fixtures/MANIFEST.json`); never edit it, never tune on it.
- Deferred checks: `docs/DEFERRED-VALIDATION.md`. Nothing in this repository has been run yet unless that file says so.
