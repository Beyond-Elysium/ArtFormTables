"""Unit tests for the GA4 extractor's pure transforms + idempotent ingest path.

Everything runs against a canned runReport fixture — no network, no creds.
"""

import json
import os

import pandas as pd
import pytest

import extract_ga4
import ingest

FIXTURES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures")


@pytest.fixture()
def payload() -> dict:
    with open(os.path.join(FIXTURES_DIR, "ga4_runreport.json")) as f:
        return json.load(f)


def test_traffic_rows_maps_ga4_names_to_lake_columns(payload):
    rows = extract_ga4.traffic_rows(payload)
    assert rows[0] == {
        "date": "2026-07-01",
        "channel": "Organic Search",
        "users": 95,
        "sessions": 120,
        "page_views": 340,
        "conversions": 6,          # keyEvents ARE GA4's conversions
        "engaged_sessions": 66,    # round(120 * 0.55)
    }
    assert [r["date"] for r in rows] == ["2026-07-01", "2026-07-01", "2026-07-02"]


def test_traffic_rows_engaged_sessions_is_additive_reconstruction(payload):
    rows = extract_ga4.traffic_rows(payload)
    # 80 * 0.4125 = 33.0 exactly; 130 * 0.6 = 78
    assert rows[1]["engaged_sessions"] == 33
    assert rows[2]["engaged_sessions"] == 78


def test_traffic_rows_empty_payload_is_empty():
    assert extract_ga4.traffic_rows({}) == []
    assert extract_ga4.traffic_rows({"rowCount": 0}) == []


def test_traffic_rows_blank_channel_falls_back(payload):
    payload["rows"][0]["dimensionValues"][1]["value"] = ""
    rows = extract_ga4.traffic_rows(payload)
    assert rows[0]["channel"] == "(other)"


def test_iso_date():
    assert extract_ga4.iso_date("20260701") == "2026-07-01"
    assert extract_ga4.iso_date("2026-07-01") == "2026-07-01"  # defensive pass-through


def test_traffic_request_window_and_shape():
    req = extract_ga4.traffic_request("2026-01-01", "2026-01-31")
    assert req["dateRanges"] == [{"startDate": "2026-01-01", "endDate": "2026-01-31"}]
    assert [d["name"] for d in req["dimensions"]] == ["date", "sessionDefaultChannelGroup"]
    assert [m["name"] for m in req["metrics"]] == [
        "sessions", "totalUsers", "screenPageViews", "keyEvents", "engagementRate",
    ]


def test_resolve_window_defaults_and_incremental():
    since, until = extract_ga4.resolve_window(None, "2026-07-15", incremental=False)
    assert (since, until) == ("2025-07-16", "2026-07-15")  # 365 days inclusive
    since, until = extract_ga4.resolve_window(None, "2026-07-15", incremental=True)
    assert (since, until) == ("2026-07-09", "2026-07-15")  # 7 days inclusive
    with pytest.raises(SystemExit):
        extract_ga4.resolve_window("2026-08-01", "2026-07-15", incremental=False)


def test_load_clients_has_all_ten_real_properties():
    clients = extract_ga4.load_clients()
    assert len(clients) == 10
    assert clients["artform"]["ga4_property"] == "310586485"
    assert clients["govcon-ideators"]["ga4_property"] == "395344759"
    # property ids must be strings (YAML quoting) so they never lose leading zeros
    assert all(isinstance(c["ga4_property"], str) for c in clients.values())


def test_upsert_via_ingest_is_idempotent(tmp_path, monkeypatch, payload):
    """Re-running the same window must not duplicate rows (ingest.py contract)."""
    monkeypatch.setattr(ingest, "DATA_DIR", str(tmp_path))
    rows = extract_ga4.traffic_rows(payload)

    r1 = ingest.upsert("testclient", "ga4", "2026-07-01", "2026-07-02", pd.DataFrame(rows))
    r2 = ingest.upsert("testclient", "ga4", "2026-07-01", "2026-07-02", pd.DataFrame(rows))
    assert r1["rows_total"] == len(rows)
    assert r2["rows_total"] == r1["rows_total"]

    df = pd.read_parquet(os.path.join(str(tmp_path), "testclient", "ga4.parquet"))
    assert len(df) == len(rows)
    assert set(df["client"]) == {"testclient"}
    # a disjoint window accumulates instead of replacing; duplicate grain keys
    # within the incoming batch are collapsed (3 rows -> 2 unique date+channel)
    later = [dict(r, date="2026-07-05") for r in rows]
    r3 = ingest.upsert("testclient", "ga4", "2026-07-05", "2026-07-05", pd.DataFrame(later))
    assert r3["rows_total"] == len(rows) + 2
