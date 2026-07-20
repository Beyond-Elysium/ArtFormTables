#!/usr/bin/env python3
"""
Post-pipeline health assertions for the Parquet lake.

Run after extraction + rollups (pipeline.sh does). For each checked source it
asserts, with clear failure logging and a non-zero exit on any failure:

  1. data exists     — data/**/<source>.parquet has > 0 rows
  2. count grew      — total rows >= the count recorded by the previous run
                       (state in store/pipeline_state.json; a re-run on the
                       same day holds equal, which passes — never shrinks)
  3. freshness       — latest date == yesterday (>= today - --max-lag-days;
                       default lag 1 day)

`--require-clients` additionally asserts every client configured in
clients.yaml has > 0 rows of its own for the source (initial-backfill check:
"row counts > 0 per client").

    python health_check.py --source ga4 --source ai_traffic
    python health_check.py --source ga4 --require-clients   # after a backfill

State is only updated when every check passes, so a failing run keeps the last
good baseline. Safe to re-run.
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import sys
from datetime import date, timedelta

import duckdb

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, "data")
STORE_DIR = os.path.join(HERE, "store")
STATE_FILE = os.path.join(STORE_DIR, "pipeline_state.json")
CLIENTS_YAML = os.path.join(HERE, "clients.yaml")

# clients.yaml key that marks a client as configured for a given source
SOURCE_CONFIG_KEY = {
    "ga4": "ga4_property",
    "ai_traffic": "ga4_property",
    "ad_spend": "google_ads_customer_id",
}


def _fail(msg: str, failures: list[str]) -> None:
    print(f"[health] FAIL: {msg}", file=sys.stderr)
    failures.append(msg)


def _lake_stats(source: str, time_col: str = "date") -> tuple[int, str | None]:
    """(total rows, latest ISO date) across data/**/<source>.parquet."""
    pattern = os.path.join(DATA_DIR, "**", f"{source}.parquet")
    files = glob.glob(pattern, recursive=True)
    if not files:
        return 0, None
    con = duckdb.connect()
    glob_lit = pattern.replace("'", "''")
    n, latest = con.execute(
        f"SELECT COUNT(*), MAX(CAST({time_col} AS VARCHAR)) "
        f"FROM read_parquet('{glob_lit}', union_by_name=true)"
    ).fetchone()
    con.close()
    return int(n), (str(latest)[:10] if latest is not None else None)


def _client_rows(source: str, client: str) -> int:
    path = os.path.join(DATA_DIR, client, f"{source}.parquet")
    if not os.path.exists(path):
        return 0
    con = duckdb.connect()
    n = con.execute(f"SELECT COUNT(*) FROM read_parquet('{path.replace(chr(39), chr(39) * 2)}')").fetchone()[0]
    con.close()
    return int(n)


def _load_state() -> dict:
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE) as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError) as e:
            print(f"[health] warn: unreadable state file {STATE_FILE} ({e}); starting fresh")
    return {}


def _save_state(state: dict) -> None:
    os.makedirs(STORE_DIR, exist_ok=True)
    tmp = STATE_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(state, f, indent=2, sort_keys=True)
    os.replace(tmp, STATE_FILE)


def _configured_clients(source: str) -> list[str]:
    key = SOURCE_CONFIG_KEY.get(source)
    if key is None or not os.path.exists(CLIENTS_YAML):
        return []
    import yaml
    with open(CLIENTS_YAML) as f:
        doc = yaml.safe_load(f) or {}
    return sorted(slug for slug, cfg in (doc.get("clients") or {}).items()
                  if str((cfg or {}).get(key) or "").strip())


def check_source(source: str, state: dict, max_lag_days: int,
                 require_clients: bool, failures: list[str]) -> None:
    rows, latest = _lake_stats(source)
    prev = int(state.get(source, {}).get("rows", 0))
    print(f"[health] {source}: rows={rows} (prev={prev}) latest={latest}")

    if rows <= 0:
        _fail(f"{source}: no rows in the lake (data/**/{source}.parquet)", failures)
        return
    if rows < prev:
        _fail(f"{source}: row count shrank ({prev} -> {rows}) — extraction lost data?", failures)

    freshest_allowed = date.today() - timedelta(days=max_lag_days)
    if latest is None:
        _fail(f"{source}: could not determine latest date", failures)
    elif date.fromisoformat(latest) < freshest_allowed:
        _fail(f"{source}: stale — latest date {latest} < expected {freshest_allowed} "
              f"(yesterday, lag {max_lag_days}d); did extraction run?", failures)

    if require_clients:
        for client in _configured_clients(source):
            n = _client_rows(source, client)
            if n <= 0:
                _fail(f"{source}: client {client!r} has 0 rows — backfill it "
                      f"(python extract_ga4.py --client {client})", failures)
            else:
                print(f"[health] {source}/{client}: {n} rows")

    state[source] = {"rows": rows, "latest": latest, "checked": date.today().isoformat()}


def main() -> None:
    ap = argparse.ArgumentParser(description="Assert the Parquet lake is present, growing, and fresh.")
    ap.add_argument("--source", action="append",
                    help="source to check (repeatable; default: ga4 ai_traffic)")
    ap.add_argument("--max-lag-days", type=int,
                    default=int(os.environ.get("HEALTH_MAX_LAG_DAYS", "1")),
                    help="allowed staleness in days (default 1 = latest date must be yesterday)")
    ap.add_argument("--require-clients", action="store_true",
                    help="also assert every configured client has > 0 rows per source")
    args = ap.parse_args()
    sources = args.source or ["ga4", "ai_traffic"]

    state = _load_state()
    failures: list[str] = []
    for source in sources:
        check_source(source, state, args.max_lag_days, args.require_clients, failures)

    if failures:
        print(f"[health] {len(failures)} check(s) FAILED — state NOT updated:", file=sys.stderr)
        for msg in failures:
            print(f"[health]   - {msg}", file=sys.stderr)
        raise SystemExit(1)

    _save_state(state)
    print(f"[health] OK — all checks passed for: {', '.join(sources)} (state -> {STATE_FILE})")


if __name__ == "__main__":
    main()
