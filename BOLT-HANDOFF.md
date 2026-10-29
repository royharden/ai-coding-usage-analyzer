# Bolt handoff: AI Coding Usage Analyzer

## Target and readiness

- App root: this inner repository, branch `main`, source version `0.1.0`; local Git only, no remote or push.
- Database path: **none**. Private transcripts are processed locally in a browser worker or Node CLI.
- Target/baseline: static frontend source; no existing cloud resources or applied migrations.
- Hosting/publication: unconfigured; prepare and inspect only. No import, provision, deploy or publish was performed.
- Status: source construction implemented and statically reviewed; install, runtime and import/build readiness pending.
- Owner prerequisites: decide when to activate dependencies/validation and whether any later import/hosting is authorized.
  The application itself needs no account, credential or API key.

## Build and configuration

| Item | Command / source | Status |
|---|---|---|
| Runtime | Declared Node >=20.11, npm; React18/TypeScript/Vite | Runtime compatibility unverified; syntax checks used Node24 |
| First install | `npm install`; commit generated package-lock.json | Pending; no lockfile exists |
| Frozen install | `npm ci` after lockfile admission | Pending |
| Development | `npm run dev` | Never started |
| Build/output | `npm run build` → `dist/` | Never built |
| Type/lint/tests | `npm run typecheck`, `npm run lint`, `npm test` | Never run |
| Preview | `npm run preview`, top-level Chrome/Edge | Never started/observed |
| Browser entry | `src/web/main.tsx`, one module worker | Source exists; browser behavior unverified |
| Public configuration | `.env.example` comments only | No variables needed |
| Rates | `prices/prices.json` zero rows, optional local price-file selection | Production cost unknown until independently verified rates supplied |

Preserve the no-backend design. A successful frontend build would not prove runtime privacy or filesystem correctness.

## Provisioning inventory

| Resource | Disposition |
|---|---|
| Database and SQL migrations | Not required |
| Functions / edge functions | Not required |
| Auth providers, callbacks and user sessions | Not required |
| Storage buckets, policies and uploads | Not required |
| Server secrets / public provider keys | Not required |
| Realtime, schedulers and workers on a server | Not required |
| Paid APIs, webhooks and external integrations | Not required |
| Seeds | Only committed synthetic local fixtures; never upload real transcripts |

No privileged fallback, demo service or fake model response is needed: there is no model to mock. The CLI remains local;
hosting the SPA does not give it server filesystem access. Browser imports require explicit local file selection.

## Acceptance still pending

| Check | Required observation |
|---|---|
| Install/type/lint/test/build | Record actual command outcomes and generated lockfile |
| Dev oracle | `npm run check-fixtures`, `npm run eval`, inspect all exact field differences |
| Independent held-out review | Re-derive arithmetic/freeze, then separately authorize explicit first held-out check/eval |
| Reproducible demo | `npm run demo`; naive control visibly differs on its supported fields |
| Browser parity | Select fixture logs plus local fixtures/prices.test.json, matching timezone/filters; compare CLI |
| Picker/lifecycle | Top-level and iframe fallbacks, cancel/reset/stale messages, limits and download URL revocation |
| Privacy | Inspect built CSP, worker artifact and post-load network behavior; no bundled transcript samples |
| Filesystem | Windows links/junctions, read-only sources and exclusive output guard |
| Rate activation | Primary-source rows, dated provenance and independent review, or retain explicit unknown costs |

Every check above is unexecuted. Exact steps and additional edge cases are in `docs/DEFERRED-VALIDATION.md`.

## Conditional prompt for a later authorized import

> Read BOLT-HANDOFF.md and inspect this source at the intended branch/revision. The selected database path is **none**.
> Preserve local transcript processing, the shared pure core, module worker, CSP and all safe exports. Inspect dependency
> and build gaps, run only the validation separately authorized by the owner, and record actual outcomes. Request no
> database, migration, auth, storage, function or secret provisioning. Do not create a remote, push, deploy or publish.
> Do not upload transcripts or replace local behavior with a hosted service. Treat unexecuted checks as pending and
> report concrete import/build/privacy blockers without inventing successful evidence.
