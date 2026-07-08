"""
Verify the blended model.

For each blended KPI we compute the value TWO independent ways and print them
side by side:

  (A) via the semantic layer  — models()["blended"].model.query(...)
  (B) an independent re-join   — pandas reads the raw source Parquets
      (ad_spend, orders, ga4), redoes the date x channel join itself, and
      computes each ratio from first principles.

If (A) and (B) agree, both the SQL build and the ratio-of-sums measures are
correct. Also confirms the blended model shows up in models() and answers a
per-channel .query(...).
"""

from __future__ import annotations

import os

import pandas as pd

from models import reload_models
from seed_blended import PLATFORM_CHANNEL

HERE = os.path.dirname(__file__)
DATA_DIR = os.path.join(HERE, "data")

MEASURES = ["impressions", "clicks", "spend", "conversions", "leads", "revenue",
            "cac", "roas", "ctr", "cpc", "conversion_rate", "cost_per_lead"]


def independent_totals() -> dict[str, float]:
    """Re-join the raw sources in pandas and compute each KPI from scratch."""
    ad = pd.read_parquet(os.path.join(DATA_DIR, "ad_spend.parquet"))
    ad["channel"] = ad["platform"].map(PLATFORM_CHANNEL)
    orders = pd.read_parquet(os.path.join(DATA_DIR, "orders.parquet"))
    ga4 = pd.read_parquet(os.path.join(DATA_DIR, "ga4.parquet"))

    channels = set(ad["channel"])  # blended universe = paid-media channels
    impressions = ad["impressions"].sum()
    clicks = ad["clicks"].sum()
    spend = ad["spend"].sum()
    conversions = ad["conversions"].sum()
    revenue = orders[orders["channel"].isin(channels)]["revenue"].sum()
    leads = ga4[ga4["channel"].isin(channels)]["conversions"].sum()

    return {
        "impressions": impressions,
        "clicks": clicks,
        "spend": spend,
        "conversions": conversions,
        "leads": leads,
        "revenue": revenue,
        "cac": spend / conversions,
        "roas": revenue / spend,
        "ctr": clicks / impressions,
        "cpc": spend / clicks,
        "conversion_rate": conversions / clicks,
        "cost_per_lead": spend / leads,
    }


def main() -> None:
    models = reload_models()
    assert "blended" in models, f"blended model missing; got {list(models)}"
    print(f"models() -> {list(models)}\n")

    bm = models["blended"].model

    # (A) semantic-layer totals (no dimensions = grand total)
    sem = bm.query(measures=MEASURES).execute().iloc[0]
    # (B) independent pandas re-join
    ind = independent_totals()

    print(f"{'measure':<16}{'semantic (A)':>18}{'independent (B)':>18}   match")
    print("-" * 68)
    all_ok = True
    for m in MEASURES:
        a, b = float(sem[m]), float(ind[m])
        ok = abs(a - b) <= 1e-6 * max(1.0, abs(b))
        all_ok = all_ok and ok
        print(f"{m:<16}{a:>18,.4f}{b:>18,.4f}   {'OK' if ok else 'MISMATCH'}")
    print("-" * 68)
    print(f"ALL MATCH: {all_ok}\n")

    # Confirm a per-channel drill-down query works end-to-end.
    print("per-channel query (spend, revenue, cac, roas, ctr):")
    perch = bm.query(
        dimensions=["channel"],
        measures=["spend", "revenue", "cac", "roas", "ctr"],
        order_by=[("spend", "desc")],
    ).execute()
    with pd.option_context("display.width", 120, "display.float_format", lambda x: f"{x:,.4f}"):
        print(perch.to_string(index=False))

    assert all_ok, "blended measures did not match independent computation"
    print("\nVERIFIED: blended KPIs match independent computation.")


if __name__ == "__main__":
    main()
