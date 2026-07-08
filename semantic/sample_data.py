"""
Synthetic grain-row generator for the ingestion demo.

This stands in for a connector's `DatasetProvider.fetchRows(config, ctx)` output
(see app/lib/connectors/dataset.ts): finer-grained rows keyed by a time column x
dimensions, plus raw measure columns. Given a client + window it emits the exact
row shape `ingest.py` expects, so the whole end-to-end path can be exercised with
no live source.

Generation is DETERMINISTIC per (client, date): re-generating the same window
produces byte-identical measures. That is what lets the idempotency demo prove a
re-run is a true no-op rather than merely a same-count coincidence.
"""

from __future__ import annotations

import argparse
import hashlib
import os
from datetime import date, timedelta

import pandas as pd

CHANNELS = ["Organic", "Paid", "Social", "Direct", "Referral", "Email"]
DEVICES = ["desktop", "mobile", "tablet"]
COUNTRIES = ["US", "GB", "CA", "DE", "AU"]

_CH_BASE = {"Organic": 900, "Paid": 400, "Social": 300, "Direct": 600, "Referral": 150, "Email": 220}
_DEV_MULT = {"desktop": 1.0, "mobile": 0.85, "tablet": 0.2}
_CO_MULT = {"US": 1.0, "GB": 0.4, "CA": 0.3, "DE": 0.25, "AU": 0.2}


def _rand01(*parts: str) -> float:
    """Deterministic pseudo-random in [0,1) from a stable hash of the inputs."""
    h = hashlib.sha256("|".join(parts).encode()).hexdigest()
    return int(h[:8], 16) / 0xFFFFFFFF


def _daterange(start: str, end: str):
    d0 = date.fromisoformat(start)
    d1 = date.fromisoformat(end)
    d = d0
    while d <= d1:
        yield d
        d += timedelta(days=1)


def generate(client: str, start: str, end: str) -> pd.DataFrame:
    """Grain rows (client x date x channel x device x country) for a window."""
    rows = []
    for d in _daterange(start, end):
        iso = d.isoformat()
        weekend = d.weekday() >= 5
        for ch in CHANNELS:
            for dev in DEVICES:
                for co in COUNTRIES:
                    r = _rand01(client, iso, ch, dev, co)
                    users = int(
                        _CH_BASE[ch] * _DEV_MULT[dev] * _CO_MULT[co]
                        * (0.6 if weekend else 1.0) * (0.7 + r * 0.6)
                    )
                    if users <= 0:
                        continue
                    rows.append(
                        {
                            "client": client,
                            "date": iso,
                            "channel": ch,
                            "device": dev,
                            "country": co,
                            "users": users,
                            "sessions": int(users * (1.2 + r * 0.3)),
                            "conversions": int(users * (0.01 + r * 0.03)),
                            "revenue": round(users * (0.5 + r * 2.5), 2),
                        }
                    )
    return pd.DataFrame(rows)


def main() -> None:
    ap = argparse.ArgumentParser(description="Emit synthetic grain rows for a client/window.")
    ap.add_argument("--client", required=True)
    ap.add_argument("--from", dest="start", required=True)
    ap.add_argument("--to", dest="end", required=True)
    ap.add_argument("--out", required=True, help="output file; .ndjson/.jsonl or .parquet")
    args = ap.parse_args()

    df = generate(args.client, args.start, args.end)
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    ext = os.path.splitext(args.out)[1].lower()
    if ext in (".ndjson", ".jsonl"):
        df.to_json(args.out, orient="records", lines=True)
    elif ext == ".parquet":
        df.to_parquet(args.out, index=False)
    else:
        raise SystemExit(f"unsupported --out extension {ext!r} (use .ndjson or .parquet)")
    print(f"wrote {len(df):,} rows -> {args.out}")


if __name__ == "__main__":
    main()
