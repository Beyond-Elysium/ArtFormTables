"""
Generate a demo dataset (Parquet) for the semantic layer.

This stands in for what the connectors will eventually write: finer-grained rows
(date x dimensions) rather than pre-aggregated panels. DuckDB reads the Parquet;
boring-semantic-layer models it. Replace this with real per-client extracts as
sources come online.
"""

from __future__ import annotations

import os
import random
from datetime import date, timedelta

import pandas as pd

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")

CHANNELS = ["Organic", "Paid", "Social", "Direct", "Referral", "Email"]
DEVICES = ["desktop", "mobile", "tablet"]
COUNTRIES = ["US", "GB", "CA", "DE", "AU"]


def build(days: int = 90, seed: int = 7) -> pd.DataFrame:
    random.seed(seed)
    start = date.today() - timedelta(days=days - 1)
    rows = []
    for i in range(days):
        d = (start + timedelta(days=i)).isoformat()
        weekend = (start + timedelta(days=i)).weekday() >= 5
        for ch in CHANNELS:
            base = {"Organic": 900, "Paid": 400, "Social": 300, "Direct": 600, "Referral": 150, "Email": 220}[ch]
            for dev in DEVICES:
                dm = {"desktop": 1.0, "mobile": 0.85, "tablet": 0.2}[dev]
                for co in COUNTRIES:
                    cm = {"US": 1.0, "GB": 0.4, "CA": 0.3, "DE": 0.25, "AU": 0.2}[co]
                    users = int(base * dm * cm * (0.6 if weekend else 1.0) * (0.7 + random.random() * 0.6))
                    if users <= 0:
                        continue
                    rows.append(
                        {
                            "date": d,
                            "channel": ch,
                            "device": dev,
                            "country": co,
                            "users": users,
                            "sessions": int(users * (1.2 + random.random() * 0.3)),
                            "conversions": int(users * (0.01 + random.random() * 0.03)),
                            "revenue": round(users * random.uniform(0.5, 3.0), 2),
                        }
                    )
    return pd.DataFrame(rows)


def main() -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    df = build()
    # Standardized `client` column so this legacy demo file unions cleanly with
    # the per-client lake (data/<client>/ga4.parquet) and specs can expose a
    # `client` dimension. Real per-client extracts flow through ingest.py.
    df.insert(0, "client", "demo")
    path = os.path.join(DATA_DIR, "ga4.parquet")
    df.to_parquet(path, index=False)
    print(f"wrote {len(df):,} rows -> {path}")


if __name__ == "__main__":
    main()
