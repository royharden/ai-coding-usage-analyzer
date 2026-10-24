# Deferred validation

This repository was written in Dirty Mode (static-only construction, 2026-10-24). Nothing below has been run.
Each row: what, why deferred, exact command or steps to validate later.

| # | What | Why deferred | How to validate |
|---|---|---|---|
| 1 | Dependency install and lockfile | No installs allowed during construction; versions are caret ranges | `npm install`, commit `package-lock.json`, then use `npm ci` |
| 2 | Re-check log formats on current agent versions | Recon (docs/RECON.md) is one machine, one day | Re-run a key-shape check on fresh copies; update RECON.md; changed rules → new fixture edition |

| 3 | Independent held-out arithmetic and freeze review | M0 static construction is not a score | A separate reviewer re-derives H01-H10 from WORKSHEET.md and inputs; verify every MANIFEST.json SHA-256 before code admission |
| 4 | Executable fixture shape/coverage/hash checks | No product tooling has run | After M4 exists, run `npm run check-fixtures`; inspect every code/trap map and ≥24 dev/≥10 held-out counts; compare freeze hashes without rewriting edition 1 |
| 5 | Exact analyzer/control score and first held-out run | No analyzer exists at M0; no execution allowed | After independent review and activation, run `npm run eval` (dev), then authorize one `npm run eval -- --heldout`; preserve first-score ledger and label later runs diagnostic |
| 6 | Full acceptance commands and output safety | Dirty Mode prohibits installs/tests/builds/demo | At activation run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run demo`; execute planned M3 export/privacy assertions and M4 metamorphic checks |
| 7 | Remaining dev coverage | M0 intentionally freezes existing ten held-out folders only | Author D01-D24 following docs/TRAPS.md, including actual very-long/invalid-UTF8 data, and confirm all trap assertions with M4 checker |

| 8 | M1 core type/lint/unit validation | Dirty Mode: source and `node --check` syntax inspection only; no application imports or test execution | After activation run `npm run typecheck`, `npm run lint`, then `npm test -- tests/core/lines.test.ts tests/core/claude.test.ts tests/core/codex.test.ts tests/core/reconcile.test.ts tests/core/prices.test.ts tests/core/money.test.ts` |
| 9 | M1 dev arithmetic and reconciliation | D01-D10 answers were authored independently; no analyzer score exists | Once M2/M4 exist, run `npm run check-fixtures` and `npm run eval`; independently compare every D01-D10 bucket, reason counter, quality and price population against `docs/oracle-worksheet.md` |
| 10 | Streaming memory and host injection | Provisional metadata cap is unbenchmarked; strict host decoding/hash implementations arrive in M2 | Verify fatal UTF-8 with BOM preservation (`ignoreBOM:true`), chunk boundaries, >8 MiB discard/recovery, one shared `MetadataBudget` through intake and reconciliation, <=100 evidence refs per reason, and visible `metadata_cap_reached` under tiny caps; run the named core tests above and later the 600 MB synthetic intake check |
| 11 | Retry comparison coverage for unhashable inputs | Canonical input is iterative; nonfinite parsed numbers or host SHA failure omit the transient hash while preserving usage/tool facts | At activation add/exercise a deeply nested valid tool input, parsed `1e400`, and a rejecting host hash; check accounting survives, missing hashes cannot qualify a retry, and no digest/raw content enters any report or export |
