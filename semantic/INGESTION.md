# Ingestion, History & Scale

How data gets **into** the semantic layer and **persists / grows** past any
provider's API lookback. The query side (`app.py`, `models.py`) is unchanged; this
doc covers the write side: the store layout, the idempotent runner (`ingest.py`),
the pre-aggregations (`rollups.py`), and how a scheduled refresh would run.

```
connector.fetchRows()  ─▶  grain rows (NDJSON/Parquet)  ─▶  ingest.py
                                                              │  idempotent upsert
                                                              ▼
                       data/<client>/<source>.parquet   ◀── the lake (source of truth)
                                │                             │
                        models.py globs & unions        rollups.py (daily ▶ monthly)
                                │                             ▼
                     boring-semantic-layer          store/warehouse.duckdb
                                │                    store/rollups/<source>_monthly.parquet
                                ▼                    specs/<source>_monthly.yaml
                       FastAPI /query  ◀────────────────────┘  (wide-range queries)
```

## 1. Store layout

**A per-client Parquet lake is the source of truth**, plus a file-backed DuckDB
for pre-aggregations:

```
data/<client>/<source>.parquet          # one file per (client, source), all history
store/warehouse.duckdb                  # persistent DuckDB: <source> views + *_monthly tables
store/rollups/<source>_monthly.parquet  # materialized monthly rollups (a queryable model)
```

Every row carries a standardized **`client`** column (written authoritatively by
`ingest.py` from `--client`). `models.py` already globs `data/**/<source>.parquet`
and unions the files, so specs expose a `client` dimension for per-tenant filtering
(added to `specs/ga4.yaml`) with **zero loader changes**.

### Why this layout

- **Parquet lake, partitioned by client** — columnar + compressed, DuckDB reads it
  natively with zero load step, and the existing generic glob-union loader already
  consumes it. Per-client files give cheap tenant isolation (drop/rebuild one
  client without touching others) and let a query prune to one file via the
  `client` dimension. It scales by adding files, not by growing one hot table.
- **Partition by `client`, not by date** — a per-`(client, source)` file keeps the
  file count tiny and the whole idempotent upsert is a single-file rewrite. Date
  partitioning would cut rewrite cost at very large scale, but at this size it only
  adds many-small-files overhead. The upsert is date-**windowed** regardless (see
  below), so switching to hive `client=/date=` partitions later is a drop-in change
  to `part_path()` + the write.
- **DuckDB file only for derived data** — the raw lake stays the portable,
  tool-agnostic source of truth; the `.duckdb` file holds rollup tables/views that
  are always rebuildable from the lake, so it is disposable and git-ignored.

`data/`, `store/`, and `*.duckdb` are git-ignored — the store is a runtime
artifact, rebuilt by re-ingesting.

## 2. Idempotent ingestion — `ingest.py`

```sh
python ingest.py --client acme --source ga4 \
    --from 2023-01-01 --to 2023-01-31 --input rows.ndjson \
    [--time-col date] [--emit-spec] [--rollup]
```

Input is grain-level rows in **NDJSON, Parquet, or CSV** — exactly the shape a
connector's `DatasetProvider.fetchRows()` emits (a time column × dimensions × raw
measures). `--client` is authoritative and (re)writes the `client` column.

### Idempotency strategy — delete-window-then-insert

For a run scoped to `(client, source, [--from, --to])`:

1. Keep every existing row in `data/<client>/<source>.parquet` whose date is
   **outside** `[from, to]`.
2. Append the incoming window (first de-duplicated on the full grain key
   `client + time + dimensions`, keeping the last occurrence, in case a provider
   returns duplicate grain rows).
3. Write to a temp file and `os.replace()` it into place (atomic publish — readers
   never see a half-written file).

Re-running the same `(client, source, window)` replaces exactly the same slice
with exactly the same rows, so **row count and contents are stable**. Verified:
three runs of the recent window all report `-> 6120 total` and the sorted content
hash is unchanged. This also makes **restatements** safe — re-fetch a corrected
window and it overwrites in place rather than duplicating.

### Backfill vs incremental

Same operation, different window. **Backfill** = a wide/old window (e.g.
`2023-01-01..2023-01-31`); **incremental** = a narrow/recent one (e.g.
`2026-06-01..2026-07-07`). Windows for disjoint date ranges are independent and
accumulate, so history grows **beyond a provider's API lookback**: the demo store
spans `2023-01-01 .. 2026-07-07` from an old backfill + a recent incremental,
retention a live API window could not provide on its own.

### New source = no Python

`--emit-spec` writes `specs/<source>.yaml` inferred from the rows (numeric columns
→ `sum` measures, the rest → dimensions, plus `client` + the time column) if one
doesn't exist yet. Verified: an unseen `ad_spend` NDJSON became a queryable model
(`platform`, `campaign`, `cost`, `clicks`, ...) with no code. Existing specs are
never overwritten.

## 3. Rollups / pre-aggregations — `rollups.py`

```sh
python rollups.py [--source ga4] [--time-col date]     # or ingest.py --rollup
```

For each source it builds a daily→monthly pre-aggregation, materialized both as a
DuckDB table in `store/warehouse.duckdb` and as
`store/rollups/<source>_monthly.parquet`, and emits `specs/<source>_monthly.yaml`
so the rollup is a **first-class queryable model** (`ga4_monthly`).

- **Additive measures** (`users`, `sessions`, `conversions`, `revenue`) `SUM`
  exactly from daily to monthly — a multi-year monthly scan touches ~30× fewer
  rows than the daily grain for identical totals. Verified: `ga4_monthly` grand
  totals equal the daily `ga4` totals to the cent.
- **Ratio measures** (`revenue_per_user`, `conversion_rate`) are **not** stored
  pre-divided; the spec defines them as `sum(a)/sum(b)`, so they stay correct when
  recomputed from monthly sums (averaging pre-divided ratios would be wrong).

### How the query service prefers a rollup for wide ranges

`rollups.prefer_rollup(start, end, grain, threshold_days=90)` encodes the rule:
use `<source>_monthly` when the grain is month-or-coarser, or the span is wide
(≥ 90 days). The query service (`app.py`) can consult it and swap `model` from
`ga4` to `ga4_monthly` (mapping the time dimension `date`→`month`) before running
the query — a wide "revenue by month, last 3 years" request then scans hundreds of
monthly rows instead of hundreds of thousands of daily ones, with identical
results. Kept as documentation + a pure helper here to avoid changing the query
contract; wiring it into `app.py` is a small, localized follow-up.

## 4. Scheduled refresh (ties into the app's Vercel cron)

The app already runs a Vercel cron for reports
(`app/app/api/cron/reports/route.ts`, `GET`, `CRON_SECRET` bearer or the
`x-vercel-cron` header). A sibling **`/api/cron/ingest`** would mirror it: on a
schedule, for each client + source, POST a recent window to the semantic service,
which shells out to `ingest.py --client … --source … --from … --to … --rollup`.
Because the upsert is idempotent, overlapping windows (e.g. always re-pull the last
7 days to absorb late/restated data) never duplicate rows. A daily incremental keeps
the lake fresh; a one-off wide backfill seeds history. Sketch:

```jsonc
// vercel.json
{ "crons": [
  { "path": "/api/cron/reports", "schedule": "0 13 * * 1" },   // existing
  { "path": "/api/cron/ingest",  "schedule": "0 6 * * *" }     // daily incremental
]}
```

```ts
// app/app/api/cron/ingest/route.ts  (same auth guard as reports/route.ts)
for (const c of clients) {
  for (const src of c.sources.filter(hasDataset)) {
    const rows = await src.fetchRows(cfg, { client: c.slug, start, end });
    await postToSemantic("/ingest", { client: c.slug, source: src.datasetSpec.model, start, end, rows });
  }
}
```

## 5. End-to-end: a new connector's `DatasetProvider` → the store

1. A connector implements `DatasetProvider` (`app/lib/connectors/dataset.ts`):
   a `datasetSpec` (model, grain, timeColumn, dimensions, measures) + `fetchRows()`.
2. The cron (or a manual run) calls `fetchRows(config, { client, start, end })` →
   grain `DatasetRow[]`, serialized to NDJSON/Parquet.
3. `ingest.py --client … --source <datasetSpec.model> --from … --to … --input …
   --emit-spec --rollup` upserts into `data/<client>/<model>.parquet`, writes
   `specs/<model>.yaml` on first sight, and refreshes monthly rollups.
4. `models.py` globs the new file and `boring-semantic-layer` models it — the
   source is now live for `/query` (cross-filter, drill-down, dynamic calcs,
   client filtering, rollup routing) with **no further code**.

Adding a source is: implement `DatasetProvider`, point the cron at it. Everything
downstream is generic.

## Verification (reproducible)

```sh
cd semantic
python seed.py                                                        # legacy demo file (client=demo)
python sample_data.py --client acme --from 2023-01-01 --to 2023-01-31 --out old.parquet
python sample_data.py --client acme --from 2026-06-01 --to 2026-07-07 --out recent.ndjson
python ingest.py --client acme --source ga4 --from 2023-01-01 --to 2023-01-31 --input old.parquet
python ingest.py --client acme --source ga4 --from 2026-06-01 --to 2026-07-07 --input recent.ndjson --rollup
python ingest.py --client acme --source ga4 --from 2026-06-01 --to 2026-07-07 --input recent.ndjson  # idempotent: count stable
python rollups.py
```

Observed: idempotent re-runs hold at **6120 rows** (identical content hash);
`ga4_monthly` totals equal daily `ga4` totals to the cent; the acme store spans
**2023-01-01 → 2026-07-07** across the old backfill and the recent incremental.
