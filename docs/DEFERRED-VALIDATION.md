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
