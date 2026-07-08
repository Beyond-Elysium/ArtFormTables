#!/usr/bin/env python3
"""
Daily -> monthly rollups (pre-aggregations) for fast long-range queries.

For every source in the lake we materialize a monthly pre-aggregation into the
file-backed warehouse AND to a Parquet file the semantic layer can model:

    store/warehouse.duckdb        # persistent DuckDB: <source> view + <source>_monthly table
    store/rollups/<source>_monthly.parquet   # queryable rollup (specs/<source>_monthly.yaml)

Additive measures (users, sessions, conversions, revenue) SUM exactly from daily
to monthly, so a monthly-grain scan over a multi-year range touches ~30x fewer
rows than the daily grain while returning identical totals. Ratio measures
(revenue_per_user, conversion_rate) are NOT stored pre-divided; they are defined
in the spec as sum(a)/sum(b) and stay correct when recomputed from monthly sums.

Query routing (documented, see INGESTION.md): the query service can pick the
`<source>_monthly` model instead of `<source>` when a request's date span is wide
and its grain is month/coarser. `prefer_rollup()` encodes that rule of thumb.
"""

from __future__ import annotations

import argparse
import glob
import os

import duckdb
import pandas as pd
import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, "data")
SPECS_DIR = os.path.join(HERE, "specs")
STORE_DIR = os.path.join(HERE, "store")
ROLLUP_DIR = os.path.join(STORE_DIR, "rollups")
WAREHOUSE = os.path.join(STORE_DIR, "warehouse.duckdb")

CLIENT_COL = "client"


def _sources() -> list[str]:
    """Every source that has data in the lake (matches models.py's `**` glob)."""
    found = set()
    for p in glob.glob(os.path.join(DATA_DIR, "**", "*.parquet"), recursive=True):
        found.add(os.path.splitext(os.path.basename(p))[0])
    return sorted(found)


def _infer_schema(cols: list[str], dtypes: dict, time_col: str) -> tuple[list[str], list[str]]:
    dims, measures = [], []
    for c in cols:
        if c in (CLIENT_COL, time_col):
            continue
        if str(dtypes[c]).startswith(("int", "float", "Int", "Float")) or \
           pd.api.types.is_numeric_dtype(dtypes[c]):
            measures.append(c)
        else:
            dims.append(c)
    return dims, measures


def build_rollups(sources: list[str] | None = None, time_col: str = "date") -> list[dict]:
    os.makedirs(ROLLUP_DIR, exist_ok=True)
    targets = sources if sources is not None else _sources()
    con = duckdb.connect(WAREHOUSE)
    out = []
    for source in targets:
        # same glob models.py unions, so rollup totals match the daily model
        lake_glob = os.path.join(DATA_DIR, "**", f"{source}.parquet")
        if not glob.glob(lake_glob, recursive=True):
            continue

        # daily-grain view over the whole per-client lake
        glob_lit = lake_glob.replace("'", "''")
        con.execute(
            f"CREATE OR REPLACE VIEW {source} AS "
            f"SELECT * FROM read_parquet('{glob_lit}', union_by_name=true)"
        )
        schema = con.execute(f"SELECT * FROM {source} LIMIT 0").df()
        dims, measures = _infer_schema(
            list(schema.columns), dict(schema.dtypes), time_col
        )

        month_expr = f"strftime(CAST({time_col} AS DATE), '%Y-%m-01')"
        group_cols = [CLIENT_COL, "month"] + dims
        sum_cols = ", ".join(f"SUM({m}) AS {m}" for m in measures)
        select_dims = ", ".join([CLIENT_COL, f"{month_expr} AS month"] + dims)
        group_by = ", ".join([CLIENT_COL, month_expr] + dims)

        con.execute(
            f"CREATE OR REPLACE TABLE {source}_monthly AS "
            f"SELECT {select_dims}, {sum_cols} FROM {source} GROUP BY {group_by}"
        )

        parquet_path = os.path.join(ROLLUP_DIR, f"{source}_monthly.parquet")
        con.execute(f"COPY {source}_monthly TO '{parquet_path}' (FORMAT PARQUET)")
        n = con.execute(f"SELECT COUNT(*) FROM {source}_monthly").fetchone()[0]

        spec_path = _emit_monthly_spec(source, dims, measures)
        out.append(
            {"model": f"{source}_monthly", "rows": int(n),
             "parquet": parquet_path, "spec": spec_path, "group_cols": group_cols}
        )
    con.close()
    return out


def _emit_monthly_spec(source: str, dims: list[str], measures: list[str]) -> str:
    """specs/<source>_monthly.yaml — a first-class model over the rollup parquet."""
    dim_map = {CLIENT_COL: f"_.{CLIENT_COL}", "month": "_.month"}
    dim_map.update({d: f"_.{d}" for d in dims})
    meas_map = {m: f"_.{m}.sum()" for m in measures}
    # re-expose the same ratio calcs the daily spec offers, if the parts exist
    if "revenue" in measures and "users" in measures:
        meas_map["revenue_per_user"] = "_.revenue.sum() / _.users.sum()"
    if "conversions" in measures and "sessions" in measures:
        meas_map["conversion_rate"] = "_.conversions.sum() / _.sessions.sum()"
    spec = {
        "model": f"{source}_monthly",
        "source": f"store/rollups/{source}_monthly.parquet",
        "description": f"{source} monthly rollup (pre-aggregation for wide ranges)",
        "time_dimension": "month",
        "dimensions": dim_map,
        "measures": meas_map,
    }
    os.makedirs(SPECS_DIR, exist_ok=True)
    path = os.path.join(SPECS_DIR, f"{source}_monthly.yaml")
    with open(path, "w") as f:
        yaml.safe_dump(spec, f, sort_keys=False, default_flow_style=False)
    return path


def prefer_rollup(start: str, end: str, grain: str = "day",
                  threshold_days: int = 90) -> bool:
    """Routing heuristic: use the monthly model for wide ranges at coarse grain."""
    from datetime import date
    if grain in ("month", "quarter", "year"):
        return True
    span = (date.fromisoformat(end) - date.fromisoformat(start)).days
    return span >= threshold_days


def main() -> None:
    ap = argparse.ArgumentParser(description="Build daily->monthly rollups for all sources.")
    ap.add_argument("--source", action="append", help="limit to a source (repeatable)")
    ap.add_argument("--time-col", default="date")
    args = ap.parse_args()
    out = build_rollups(sources=args.source, time_col=args.time_col)
    if not out:
        print("[rollups] no sources found in the lake")
    for r in out:
        print(f"[rollups] {r['model']}: {r['rows']} monthly rows -> {r['parquet']}")
        print(f"[rollups]   spec -> {r['spec']}")


if __name__ == "__main__":
    main()
