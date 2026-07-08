# ArtForm Semantic Layer

A small [boring-semantic-layer](https://github.com/boringdata/boring-semantic-layer)
+ [DuckDB](https://github.com/duckdb/duckdb) service that gives the dashboards
**cross-filtering, drill-downs, dynamic calculations, and (later) NLQ** — while
keeping our branded UI and requiring **no tokens from viewers**.

The Next.js app calls it **server-to-server** with a bearer token; the browser
never holds a credential.

## Why a separate service

`boring-semantic-layer` is Python (built on Ibis) and DuckDB wants a persistent
process, so this lives outside the Vercel/Next app. The app talks to it over HTTP
via [`lib/semantic.ts`](../app/lib/semantic.ts) and the `/api/semantic` proxy.

```
connectors ─▶ Parquet ─▶ DuckDB ─▶ boring-semantic-layer ─▶ FastAPI (this)
                                                                 ▲  server-to-server (bearer)
                                                                 │
                              browser ─▶ Next /api/semantic ─────┘   (no viewer token)
```

## Run locally

```sh
cd semantic
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python seed.py                                   # -> data/ga4.parquet
python seed_blended.py                            # -> data/ad_spend.parquet, data/orders.parquet
python build_blended.py                           # -> data/blended.parquet (runs AFTER the seeders)
SEMANTIC_API_TOKEN=dev uvicorn app:app --port 8899
```

Point the app at it (`app/.env.local`):
```
SEMANTIC_API_URL=http://localhost:8899
SEMANTIC_API_TOKEN=dev
```

## API

| Route | Purpose |
| --- | --- |
| `GET /health` | liveness + model list |
| `GET /models` | dimensions/measures per model (for the UI + NLQ) |
| `POST /query` | run a query (bearer auth) |

`POST /query` body:
```json
{
  "model": "ga4",
  "dimensions": ["device"],
  "measures": ["users", "revenue_per_user"],
  "filters": [{ "field": "channel", "op": "=", "value": "Paid" }],
  "time_range": { "start": "2026-06-01", "end": "2026-06-28" },
  "order_by": [["users", "desc"]],
  "limit": 1000
}
```
Filter ops: `= != > >= < <= in`. Cross-filter and drill-down are just different
`dimensions` + `filters`; dynamic calculations are measures defined once.

## Blended (cross-source) metrics

Agency KPIs like **CAC, ROAS, CTR, CPC, conversion rate, cost per lead** span
*multiple* sources (ad spend + orders + analytics), but a BSL model is per-table.
So one build step pre-joins the sources into a single table, then a plain spec
models it — the "connect anything" contract is unchanged; only the blend needs SQL.

```
seed.py ─▶ ga4.parquet ─┐
seed_blended.py ─▶ ad_spend.parquet, orders.parquet ─┤
                                                     ▼
                              build_blended.py  (DuckDB SQL, runs AFTER seeders)
                              join/aggregate to date × channel
                                                     ▼
                              data/blended.parquet ─▶ specs/blended.yaml ─▶ model "blended"
```

`build_blended.py` aggregates each source to **date × channel** and joins:
ad platforms (Google/Meta/TikTok/LinkedIn) map to channels (Paid/Social/Referral),
summed to impressions/clicks/spend/conversions; `orders` adds revenue; `ga4`
adds users/sessions and **leads** (= GA4 conversions). Blended measures in
`specs/blended.yaml` are ratio-of-sums (e.g. `roas = revenue.sum() / spend.sum()`),
correct at any grain. `verify_blended.py` checks every KPI against an independent
pandas re-join.

## Defining models

Edit [`models.py`](./models.py): wrap a DuckDB/Parquet table with
`to_semantic_table(...).with_dimensions(...).with_measures(...)`. Measures like
`revenue_per_user = revenue.sum() / users.sum()` are the dynamic calculations —
correct at any grain.

## Deploy

Runs anywhere that hosts a container (Fly.io, Render, Railway, Cloud Run, a VM) —
**not** Vercel serverless (DuckDB needs a persistent process). Then set
`SEMANTIC_API_URL` + `SEMANTIC_API_TOKEN` in the Next project env. A `Dockerfile`
is included.

## Roadmap

1. **Real data** — replace `seed.py` with per-client extracts: connectors write
   finer-grained rows (date × dimensions) to Parquet, partitioned by client; add
   a `client` dimension or one dataset per client.
2. **Cross-filter / drill-down UI** — a client component that POSTs to
   `/api/semantic` and re-renders charts on click (filter/zoom). All branded.
3. **NLQ** — Claude maps a question → a `/query` body using the `/models` schema
   (defined dimensions/measures), so it never guesses raw SQL.

## Status

Scaffolded and verified end-to-end with the demo dataset: `/query` returns
correct aggregates and drill-downs (integrity-checked against pandas), auth is
enforced, and the Next `/api/semantic` proxy injects the token so viewers stay
token-free.
