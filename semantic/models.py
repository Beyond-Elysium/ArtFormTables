"""
Spec-driven semantic models (boring-semantic-layer over DuckDB).

Models are declared in `specs/*.yaml` — dimensions, measures (incl. dynamic
calculations), and a Parquet `source` — and loaded generically here. Adding a
new source is: drop a spec + its Parquet data. No Python changes. This is the
"connect anything" foundation the rest of the BI features build on.
"""

from __future__ import annotations

import glob as _glob
import os
from dataclasses import dataclass

import boring_semantic_layer as bsl
import ibis
import yaml

HERE = os.path.dirname(__file__)
SPECS_DIR = os.path.join(HERE, "specs")

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
    source: str


def _load_spec(path: str) -> ModelDef | None:
    with open(path) as f:
        spec = yaml.safe_load(f)
    name = spec["model"]
    source = spec["source"]
    files = sorted(_glob.glob(os.path.join(HERE, source), recursive=True))
    if not files:
        # No data yet for this model — skip rather than crash (connect later).
        print(f"[models] no data for {name!r} at {source!r}; skipping")
        return None

    con = connection()
    table = con.read_parquet(files)
    table_ref = f"{name}_tbl"

    config = {
        name: {
            "table": table_ref,
            "description": spec.get("description", name),
            "dimensions": spec.get("dimensions", {}),
            "measures": spec.get("measures", {}),
        }
    }
    sm = bsl.from_config(config, tables={table_ref: table})[name]
    return ModelDef(
        model=sm,
        dimensions=list(spec.get("dimensions", {}).keys()),
        measures=list(spec.get("measures", {}).keys()),
        time_dimension=spec.get("time_dimension"),
        source=source,
    )


_MODELS: dict[str, ModelDef] | None = None


def models() -> dict[str, ModelDef]:
    """Load (once) every model declared under specs/ that has data."""
    global _MODELS
    if _MODELS is None:
        out: dict[str, ModelDef] = {}
        for path in sorted(_glob.glob(os.path.join(SPECS_DIR, "*.yaml"))):
            md = _load_spec(path)
            if md is not None:
                out[os.path.splitext(os.path.basename(path))[0]] = md
        _MODELS = out
    return _MODELS


def reload_models() -> dict[str, ModelDef]:
    """Drop the cache (after new data/specs land)."""
    global _MODELS, _con
    _MODELS = None
    _con = None
    return models()
