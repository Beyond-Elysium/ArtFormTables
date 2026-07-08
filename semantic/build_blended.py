"""
Build the blended cross-source table (`data/blended.parquet`).

BSL models are per-table, so KPIs that span sources (ad spend + orders +
analytics) need a single table pre-joined to a common grain. This is the ONE
place we drop to SQL: DuckDB reads each source Parquet at its native grain,
aggregates to date x channel, and joins them. The resulting table is then a plain
declarative model (`specs/blended.yaml`) like any other — "connect anything"
stays intact; only the blend needs a build step.

RUN ORDER — this runs AFTER the seeders, since it reads their Parquet output:

    python seed.py            # -> data/ga4.parquet
    python seed_blended.py    # -> data/ad_spend.parquet, data/orders.parquet
    python build_blended.py   # -> data/blended.parquet   (this file)

Join (all at date x channel):
  * ad_spend  : platform -> channel via PLATFORM_CHANNEL, then SUM per channel
                -> impressions, clicks, spend, conversions   (paid-media funnel)
  * ga4       : SUM per channel -> users, sessions, and leads (= GA4 conversions,
                the analytics-tracked top-of-funnel signals)
  * orders    : SUM per channel -> orders, revenue           (the money)
ad_spend is the base (defines the paid-media universe); orders + ga4 LEFT JOIN in.
"""

from __future__ import annotations

import os

import duckdb

from seed_blended import PLATFORM_CHANNEL

HERE = os.path.dirname(__file__)
DATA_DIR = os.path.join(HERE, "data")


def _platform_map_values() -> str:
    # Render PLATFORM_CHANNEL as SQL VALUES so the mapping lives in one place.
    return ", ".join(f"('{p}', '{c}')" for p, c in PLATFORM_CHANNEL.items())


def build() -> None:
    ad = os.path.join(DATA_DIR, "ad_spend.parquet")
    orders = os.path.join(DATA_DIR, "orders.parquet")
    ga4 = os.path.join(DATA_DIR, "ga4.parquet")
    out = os.path.join(DATA_DIR, "blended.parquet")

    con = duckdb.connect()
    sql = f"""
    COPY (
      WITH plat_map(platform, channel) AS (VALUES {_platform_map_values()}),
      ad AS (
        SELECT a.date, m.channel,
               SUM(a.impressions) AS impressions,
               SUM(a.clicks)      AS clicks,
               SUM(a.spend)       AS spend,
               SUM(a.conversions) AS conversions
        FROM read_parquet('{ad}') a
        JOIN plat_map m USING (platform)
        GROUP BY 1, 2
      ),
      ord AS (
        SELECT date, channel,
               SUM(orders)  AS orders,
               SUM(revenue) AS revenue
        FROM read_parquet('{orders}')
        GROUP BY 1, 2
      ),
      ga AS (
        SELECT date, channel,
               SUM(users)       AS users,
               SUM(sessions)    AS sessions,
               SUM(conversions) AS leads
        FROM read_parquet('{ga4}')
        GROUP BY 1, 2
      )
      SELECT ad.date, ad.channel,
             ad.impressions, ad.clicks, ad.spend, ad.conversions,
             COALESCE(ord.orders, 0)   AS orders,
             COALESCE(ord.revenue, 0)  AS revenue,
             COALESCE(ga.users, 0)     AS users,
             COALESCE(ga.sessions, 0)  AS sessions,
             COALESCE(ga.leads, 0)     AS leads
      FROM ad
      LEFT JOIN ord USING (date, channel)
      LEFT JOIN ga  USING (date, channel)
      ORDER BY ad.date, ad.channel
    ) TO '{out}' (FORMAT PARQUET);
    """
    con.execute(sql)
    n = con.execute(f"SELECT COUNT(*) FROM read_parquet('{out}')").fetchone()[0]
    con.close()
    print(f"wrote {n:,} rows -> {out}")


if __name__ == "__main__":
    build()
