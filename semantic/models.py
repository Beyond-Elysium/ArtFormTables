"""
Semantic models (boring-semantic-layer over DuckDB).

Each model wraps a DuckDB-backed Ibis table with named **dimensions** (what you
slice by) and **measures** (what you aggregate) — defined once here and reused
for cross-filtering, drill-downs, and dynamic calculations. Measures like
`revenue_per_user` are the "dynamic calculations" defined in one place.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

import boring_semantic_layer as bsl
import ibis

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")

_con = None


def connection():
    global _con
    if _con is None:
        _con = ibis.duckdb.connect()
    return _con


@dataclass
class ModelDef:
    model: object
    dimensions: list[str]
    measures: list[str]
    time_dimension: str | None


def _ga4() -> ModelDef:
    con = connection()
    t = con.read_parquet(os.path.join(DATA_DIR, "ga4.parquet"))
    sm = (
        bsl.to_semantic_table(t, name="ga4", description="Website analytics by channel/device/country")
        .with_dimensions(
            date=lambda t: t.date,
            channel=lambda t: t.channel,
            device=lambda t: t.device,
            country=lambda t: t.country,
        )
        .with_measures(
            users=lambda t: t.users.sum(),
            sessions=lambda t: t.sessions.sum(),
            conversions=lambda t: t.conversions.sum(),
            revenue=lambda t: t.revenue.sum(),
            # Dynamic calculations — defined once, correct at any grain:
            revenue_per_user=lambda t: t.revenue.sum() / t.users.sum(),
            conversion_rate=lambda t: t.conversions.sum() / t.sessions.sum(),
        )
    )
    return ModelDef(
        model=sm,
        dimensions=["date", "channel", "device", "country"],
        measures=["users", "sessions", "conversions", "revenue", "revenue_per_user", "conversion_rate"],
        time_dimension="date",
    )


_MODELS: dict[str, ModelDef] | None = None


def models() -> dict[str, ModelDef]:
    global _MODELS
    if _MODELS is None:
        _MODELS = {"ga4": _ga4()}
    return _MODELS
