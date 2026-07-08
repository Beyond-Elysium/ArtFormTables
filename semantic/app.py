"""
ArtForm Semantic Layer — a small FastAPI service around boring-semantic-layer +
DuckDB. The Next.js app calls it server-to-server (bearer token), so viewers
never hold a credential. Powers cross-filtering, drill-downs, dynamic
calculations, and NLQ from one place.
"""

from __future__ import annotations

import os

from fastapi import FastAPI, Header, HTTPException
from ibis import _
from pydantic import BaseModel

from models import models

TOKEN = os.environ.get("SEMANTIC_API_TOKEN")

app = FastAPI(title="ArtForm Semantic Layer", version="0.1.0")

# JSON filter ops -> ibis expressions (server-controlled; no arbitrary code).
_OPS = {
    "=": lambda c, v: c == v,
    "!=": lambda c, v: c != v,
    ">": lambda c, v: c > v,
    ">=": lambda c, v: c >= v,
    "<": lambda c, v: c < v,
    "<=": lambda c, v: c <= v,
    "in": lambda c, v: c.isin(v),
}


class Filter(BaseModel):
    field: str
    op: str = "="
    value: object


class QueryBody(BaseModel):
    model: str
    dimensions: list[str] = []
    measures: list[str] = []
    filters: list[Filter] = []
    time_range: dict | None = None  # {"start": "YYYY-MM-DD", "end": "YYYY-MM-DD"}
    order_by: list[list[str]] | None = None  # [["users", "desc"], ...]
    limit: int | None = 1000


def _require_auth(authorization: str | None) -> None:
    if TOKEN and authorization != f"Bearer {TOKEN}":
        raise HTTPException(status_code=401, detail="unauthorized")


def _to_expr(f: Filter):
    if f.op not in _OPS:
        raise HTTPException(status_code=400, detail=f"unsupported op {f.op!r}")
    return _OPS[f.op](getattr(_, f.field), f.value)


@app.get("/health")
def health():
    return {"ok": True, "models": list(models().keys())}


@app.get("/models")
def list_models():
    """Schema for the UI + NLQ: dimensions/measures per model."""
    return {
        name: {
            "dimensions": md.dimensions,
            "measures": md.measures,
            "time_dimension": md.time_dimension,
        }
        for name, md in models().items()
    }


@app.post("/query")
def query(body: QueryBody, authorization: str | None = Header(default=None)):
    _require_auth(authorization)

    md = models().get(body.model)
    if md is None:
        raise HTTPException(status_code=404, detail=f"unknown model {body.model!r}")

    filters = [_to_expr(f) for f in body.filters]
    # Time range as inclusive filters on the model's time dimension (ISO dates sort lexically).
    if body.time_range and md.time_dimension:
        col = getattr(_, md.time_dimension)
        if body.time_range.get("start"):
            filters.append(col >= body.time_range["start"])
        if body.time_range.get("end"):
            filters.append(col <= body.time_range["end"])

    order_by = [(o[0], o[1] if len(o) > 1 else "asc") for o in (body.order_by or [])]

    result = md.model.query(
        dimensions=body.dimensions or None,
        measures=body.measures or None,
        filters=filters or None,
        order_by=order_by or None,
        limit=body.limit,
    ).execute()

    return {
        "model": body.model,
        "columns": list(result.columns),
        "rows": result.to_dict(orient="records"),
    }
