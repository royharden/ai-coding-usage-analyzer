# Dated price-table contract

`prices/prices.json` currently has **zero rows**. This is intentional: no live vendor prices were verified during
source-only construction. Costs are unknown until a matching, independently checked row is supplied. Tokens still count.
The browser accepts a local table file; the CLI accepts `--prices FILE`. No rates are fetched at runtime.

The machine contract is `pricetable/1`, currency `USD`, unit `micro_usd_per_mtok`:

```json
{"schema":"pricetable/1","currency":"USD","unit":"micro_usd_per_mtok","rows":[]}
```

Each row requires an exact `model`, UTC `effective_from`, `source_url` and `retrieved` civil date. Rates are nonnegative
safe integers in micro-USD per million tokens: `input`, `output`, `cache_write_5m`, `cache_write_1h`, `cache_read`.
A missing rate is acceptable only when the event needs zero tokens in that bucket. Duplicate model/effective instants,
malformed provenance/dates and invalid rates reject the table. No alias or family-latest fallback is used.

For each event, select the latest row in force at its UTC instant. Optional `supported_service_tiers`, `supported_speeds`
and `supported_inference_geos` constrain observed modifiers. Defaults are tiers `standard/default`, speed `standard`,
and geos `global/not_available`; absent/null/empty observed modifiers mean unspecified. Other values/types are unknown,
not base-priced. Optional `max_input_tokens_per_call` applies to the whole prompt, including cache reads and writes.
Codex deltas can span calls, so this is not a general per-call tier engine.

Unknown reason precedence is `no_price_row`, then unsupported modifier/long context as `tier_unsupported`, then
`rate_missing`. A zero known cost is valid for actual zero-rated/zero-token usage; an unknown cost never becomes zero.

Arithmetic is exact: `tokens × micro-USD/MTok = pico-USD`, using BigInt. One USD is 1,000,000,000,000 pico-USD.
Aggregate first, then round half-up to four decimal USD places. Positive amounts below $0.00005 display `< $0.0001`;
JSON/CSV/Markdown exact fields retain decimal pico-USD strings. `fixtures/prices.test.json` uses round synthetic rates
for hand arithmetic. It must not be promoted as a production vendor table.

To activate real rows, independently verify current primary vendor sources, effective dates, supported modes and context
limits, record provenance, obtain a second review and run price/core tests plus a smoke comparison. Do not invent
historical rates. See deferred validation item 19. No such verification or execution has occurred here.

The pure pricing functions are in `src/core/prices.ts` and `money.ts`. This schema is a proposed seam for S3
`callledger`; no ledger conversion or cross-project compatibility has been implemented or claimed.
