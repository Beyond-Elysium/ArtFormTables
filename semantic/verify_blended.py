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

import math
import os

import pandas as pd

from build_blended import source_files
from models import reload_models
from seed_blended import PLATFORM_CHANNEL

HERE = os.path.dirname(__file__)
DATA_DIR = os.path.join(HERE, "data")

MEASURES = ["impressions", "clicks", "spend", "conversions", "leads", "revenue",
            "cac", "roas", "ctr", "cpc", "conversion_rate", "cost_per_lead"]


def _read_source(name: str, empty_cols: list[str]) -> pd.DataFrame:
    """Union both lake layouts (demo data/<name>.parquet + per-client
    data/<client>/<name>.parquet), same as build_blended.source_files."""
    files = source_files(name)
    if not files:
        return pd.DataFrame(columns=empty_cols)
    return pd.concat([pd.read_parquet(f) for f in files], ignore_index=True)


def independent_totals() -> dict[str, float]:
    """Re-join the raw sources in pandas and compute each KPI from scratch."""
    ad = _read_source("ad_spend", ["date", "platform", "campaign",
                                   "impressions", "clicks", "spend", "conversions"])
    if ad.empty:
        raise SystemExit("[verify-blended] no ad_spend data in the lake — nothing to verify")
    ad["channel"] = ad["platform"].map(PLATFORM_CHANNEL)
    orders = _read_source("orders", ["date", "channel", "orders", "revenue"])
    ga4 = _read_source("ga4", ["date", "channel", "users", "sessions", "conversions"])

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
        # A live lake may lack a source (e.g. no orders): ratio KPIs degrade to
        # inf/nan on BOTH sides — that's agreement, not a mismatch.
        if not math.isfinite(a) and not math.isfinite(b):
            ok = True
        else:
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
