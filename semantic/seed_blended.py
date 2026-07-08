"""
Generate demo datasets for cross-source / blended KPIs (Parquet under data/).

These stand in for what the connectors will eventually write — finer-grained rows
per source, at each source's native grain:

  * ad_spend  — date x platform x campaign : impressions, clicks, spend, conversions
  * orders    — date x channel             : orders, revenue

`ga4.parquet` (date x channel x device x country : users, sessions, conversions,
revenue) is produced separately by `seed.py`.

Blended metrics span these sources, so they can't live on any single per-table
model. `build_blended.py` joins/aggregates these Parquets to a common grain
(date x channel) and writes `data/blended.parquet`, which `specs/blended.yaml`
then models. Pipeline order:

    python seed.py && python seed_blended.py && python build_blended.py
"""

from __future__ import annotations

import os
import random
from datetime import date, timedelta

import pandas as pd

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")

# Paid-media platforms map into the marketing channels the other sources use, so
# the sources share a join key (date x channel). Each platform can run several
# campaigns; ad_spend keeps campaign grain, the blend rolls up to channel.
PLATFORM_CHANNEL = {
    "Google": "Paid",
    "Meta": "Social",
    "TikTok": "Social",
    "LinkedIn": "Referral",
}
CAMPAIGNS = {
    "Google": ["Brand Search", "Nonbrand Search", "Shopping"],
    "Meta": ["Prospecting", "Retargeting"],
    "TikTok": ["Awareness"],
    "LinkedIn": ["Sponsored Content"],
}
# Channels that carry paid media — the universe the blended model covers so every
# row has non-zero spend/clicks/impressions (finite CAC/CPC/CTR/etc.).
PAID_CHANNELS = sorted(set(PLATFORM_CHANNEL.values()))


def build_ad_spend(days: int, start: date, seed: int) -> pd.DataFrame:
    random.seed(seed)
    # Rough per-platform economics (impressions, CTR, CPC, CVR) to keep numbers sane.
    profile = {
        "Google": dict(imps=22000, ctr=0.045, cpc=1.8, cvr=0.06),
        "Meta": dict(imps=40000, ctr=0.020, cpc=0.9, cvr=0.03),
        "TikTok": dict(imps=55000, ctr=0.015, cpc=0.6, cvr=0.02),
        "LinkedIn": dict(imps=8000, ctr=0.008, cpc=6.5, cvr=0.05),
    }
    rows = []
    for i in range(days):
        d = (start + timedelta(days=i)).isoformat()
        weekend = (start + timedelta(days=i)).weekday() >= 5
        wk = 0.7 if weekend else 1.0
        for platform, campaigns in CAMPAIGNS.items():
            p = profile[platform]
            for camp in campaigns:
                jitter = 0.7 + random.random() * 0.6
                impressions = int(p["imps"] / len(campaigns) * wk * jitter)
                clicks = int(impressions * p["ctr"] * (0.85 + random.random() * 0.3))
                if clicks <= 0:
                    continue
                spend = round(clicks * p["cpc"] * (0.9 + random.random() * 0.2), 2)
                conversions = int(clicks * p["cvr"] * (0.7 + random.random() * 0.6))
                rows.append(
                    {
                        "date": d,
                        "platform": platform,
                        "campaign": camp,
                        "impressions": impressions,
                        "clicks": clicks,
                        "spend": spend,
                        "conversions": conversions,
                    }
                )
    return pd.DataFrame(rows)


def build_orders(days: int, start: date, seed: int) -> pd.DataFrame:
    random.seed(seed + 1)
    base = {"Paid": 120, "Social": 90, "Referral": 40}
    aov = {"Paid": 85.0, "Social": 60.0, "Referral": 140.0}  # avg order value
    rows = []
    for i in range(days):
        d = (start + timedelta(days=i)).isoformat()
        weekend = (start + timedelta(days=i)).weekday() >= 5
        wk = 0.75 if weekend else 1.0
        for ch in PAID_CHANNELS:
            orders = int(base[ch] * wk * (0.7 + random.random() * 0.6))
            if orders <= 0:
                continue
            revenue = round(orders * aov[ch] * (0.85 + random.random() * 0.3), 2)
            rows.append({"date": d, "channel": ch, "orders": orders, "revenue": revenue})
    return pd.DataFrame(rows)


def main(days: int = 90, seed: int = 7) -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    start = date.today() - timedelta(days=days - 1)

    ad = build_ad_spend(days, start, seed)
    ad_path = os.path.join(DATA_DIR, "ad_spend.parquet")
    ad.to_parquet(ad_path, index=False)
    print(f"wrote {len(ad):,} rows -> {ad_path}")

    orders = build_orders(days, start, seed)
    orders_path = os.path.join(DATA_DIR, "orders.parquet")
    orders.to_parquet(orders_path, index=False)
    print(f"wrote {len(orders):,} rows -> {orders_path}")


if __name__ == "__main__":
    main()
