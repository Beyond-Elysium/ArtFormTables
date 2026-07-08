#!/usr/bin/env python3
"""
Idempotent ingestion runner for the semantic Parquet lake.

Takes grain-level rows (NDJSON or Parquet, the shape a connector's
`DatasetProvider.fetchRows()` emits) and UPSERTS them into a durable, per-client
Parquet lake that `models.py` already globs and unions:

    data/<client>/<source>.parquet     # source of truth, one file per (client, source)

Idempotency (delete-window-then-insert)
---------------------------------------
For a run scoped to (client, source, [--from, --to]) we keep every existing row
of that client's file whose date falls OUTSIDE the window, then append the
incoming rows. Re-running the same window therefore replaces exactly the same
slice with exactly the same rows -> the row count and contents are stable. This
also makes restatements safe: re-fetch a window and it overwrites in place. A
secondary drop-duplicates on the full grain key (client + time + dimensions)
guards against a provider that returns duplicate grain rows.

Backfill vs incremental are the SAME operation: backfill is just a wide/old
window, incremental a narrow/recent one. Windows for distinct date ranges are
independent, so history accumulates well beyond any provider's API lookback.

CLI
---
    python ingest.py --client acme --source ga4 --from 2023-01-01 --to 2023-01-31 \
        --input path/to/rows.ndjson [--time-col date] [--rollup] [--emit-spec]

`--client` is authoritative: the standardized `client` column is (re)written on
every row so specs can expose a `client` dimension and glob-union per-client files.
"""

from __future__ import annotations

import argparse
import os

import duckdb
import pandas as pd
import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, "data")
SPECS_DIR = os.path.join(HERE, "specs")

CLIENT_COL = "client"


def part_path(client: str, source: str) -> str:
    return os.path.join(DATA_DIR, client, f"{source}.parquet")


def read_input(path: str) -> pd.DataFrame:
    ext = os.path.splitext(path)[1].lower()
    if ext in (".ndjson", ".jsonl"):
        return pd.read_json(path, lines=True)
    if ext == ".json":
        return pd.read_json(path)
    if ext == ".parquet":
        return pd.read_parquet(path)
    if ext == ".csv":
        return pd.read_csv(path)
    raise SystemExit(f"unsupported input extension {ext!r} (use .ndjson/.jsonl/.parquet/.csv)")


def infer_schema(df: pd.DataFrame, time_col: str) -> tuple[list[str], list[str]]:
    """Non-time/non-client numeric cols are measures; the rest are dimensions."""
    dims, measures = [], []
    for c in df.columns:
        if c in (CLIENT_COL, time_col):
            continue
        if pd.api.types.is_numeric_dtype(df[c]):
            measures.append(c)
        else:
            dims.append(c)
    return dims, measures


def upsert(client: str, source: str, start: str, end: str, df: pd.DataFrame,
           time_col: str = "date") -> dict:
    """Idempotently merge `df` (a window) into data/<client>/<source>.parquet."""
    if time_col not in df.columns:
        raise SystemExit(f"input is missing time column {time_col!r}; got {list(df.columns)}")

    df = df.copy()
    df[CLIENT_COL] = client                      # authoritative, standardized
    df[time_col] = df[time_col].astype(str)      # ISO strings sort lexically

    dims, _measures = infer_schema(df, time_col)
    grain_key = [CLIENT_COL, time_col] + dims
    df = df.drop_duplicates(subset=grain_key, keep="last")

    path = part_path(client, source)
    os.makedirs(os.path.dirname(path), exist_ok=True)

    con = duckdb.connect()  # in-memory merge engine
    con.register("incoming", df)
    if os.path.exists(path):
        path_lit = path.replace("'", "''")
        # keep rows outside the window, then add the incoming window
        merged = con.execute(
            f"""
            SELECT * FROM read_parquet('{path_lit}')
              WHERE CAST({time_col} AS VARCHAR) < ?
                 OR CAST({time_col} AS VARCHAR) > ?
            UNION ALL BY NAME
            SELECT * FROM incoming
            """,
            [start, end],
        ).df()
    else:
        merged = df

    order = [time_col] + dims
    merged = merged.sort_values(order).reset_index(drop=True)

    tmp = path + ".tmp"
    merged.to_parquet(tmp, index=False)          # atomic publish
    os.replace(tmp, path)

    return {
        "path": path,
        "rows_in": len(df),
        "rows_total": len(merged),
        "dimensions": dims,
        "measures": _measures,
    }


def emit_spec_if_missing(source: str, dims: list[str], measures: list[str],
                         time_col: str) -> str | None:
    """Write specs/<source>.yaml for a brand-new source so it becomes queryable."""
    spec_path = os.path.join(SPECS_DIR, f"{source}.yaml")
    if os.path.exists(spec_path):
        return None
    dim_map = {d: f"_.{d}" for d in [CLIENT_COL, time_col] + dims}
    meas_map = {m: f"_.{m}.sum()" for m in measures}
    spec = {
        "model": source,
        "source": f"data/**/{source}.parquet",
        "description": f"{source} (auto-generated by ingest.py)",
        "time_dimension": time_col,
        "dimensions": dim_map,
        "measures": meas_map,
    }
    os.makedirs(SPECS_DIR, exist_ok=True)
    with open(spec_path, "w") as f:
        yaml.safe_dump(spec, f, sort_keys=False, default_flow_style=False)
    return spec_path


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--client", required=True)
    ap.add_argument("--source", required=True)
    ap.add_argument("--from", dest="start", required=True, help="window start (YYYY-MM-DD, inclusive)")
    ap.add_argument("--to", dest="end", required=True, help="window end (YYYY-MM-DD, inclusive)")
    ap.add_argument("--input", required=True, help="grain rows: .ndjson/.jsonl/.parquet/.csv")
    ap.add_argument("--time-col", default="date")
    ap.add_argument("--emit-spec", action="store_true",
                    help="write specs/<source>.yaml if it does not exist yet")
    ap.add_argument("--rollup", action="store_true",
                    help="rebuild monthly rollups for this source after ingest")
    args = ap.parse_args()

    df = read_input(args.input)
    res = upsert(args.client, args.source, args.start, args.end, df, time_col=args.time_col)
    print(
        f"[ingest] {args.client}/{args.source} [{args.start}..{args.end}]: "
        f"+{res['rows_in']} rows -> {res['rows_total']} total in {res['path']}"
    )

    if args.emit_spec:
        sp = emit_spec_if_missing(args.source, res["dimensions"], res["measures"], args.time_col)
        print(f"[ingest] emitted spec {sp}" if sp else "[ingest] spec already present; left as-is")

    if args.rollup:
        import rollups
        out = rollups.build_rollups(sources=[args.source], time_col=args.time_col)
        for r in out:
            print(f"[ingest] rollup {r['model']}: {r['rows']} monthly rows -> {r['parquet']}")


if __name__ == "__main__":
    main()
