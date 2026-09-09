"""Google Ads extractor: pure transform + GAQL/config helpers (no network)."""

import json
import os

import pandas as pd
import pytest

import extract_google_ads as ads
import ingest

FIXTURES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures")


@pytest.fixture()
def chunks() -> list:
    with open(os.path.join(FIXTURES_DIR, "ads_searchstream.json")) as f:
        return json.load(f)


def test_ads_rows_maps_and_aggregates(chunks):
    rows = ads.ads_rows(chunks)
    # (date, campaign) grain; the 2026-07-02 Brand Search rows from the two
    # stream chunks are summed into one row.
    assert rows == [
        {"date": "2026-07-01", "platform": "Google", "campaign": "Brand Search",
         "impressions": 1200, "clicks": 85, "spend": 45.12, "conversions": 3.5},
        {"date": "2026-07-01", "platform": "Google", "campaign": "Nonbrand Search",
         "impressions": 5400, "clicks": 160, "spend": 210.5, "conversions": 6.0},
        {"date": "2026-07-02", "platform": "Google", "campaign": "Brand Search",
         "impressions": 1000, "clicks": 72, "spend": 40.0, "conversions": 2.0},
    ]


def test_ads_rows_columns_align_with_blended_demo_schema(chunks):
    """Live rows must blend through build_blended.py exactly like the demo
    ad_spend (seed_blended.py): same columns, platform in PLATFORM_CHANNEL."""
    from seed_blended import PLATFORM_CHANNEL
    demo_cols = ["date", "platform", "campaign", "impressions", "clicks", "spend", "conversions"]
    for row in ads.ads_rows(chunks):
        assert list(row.keys()) == demo_cols
        assert row["platform"] in PLATFORM_CHANNEL


def test_ads_rows_empty_and_malformed():
    assert ads.ads_rows([]) == []
    assert ads.ads_rows(None) == []
    assert ads.ads_rows([{"fieldMask": "x"}]) == []
    # a result with no date is dropped rather than crashing
    assert ads.ads_rows([{"results": [{"metrics": {"clicks": "3"}}]}]) == []


def test_gaql_window_and_fields():
    q = ads.gaql("2026-01-01", "2026-06-30")
    assert "WHERE segments.date BETWEEN '2026-01-01' AND '2026-06-30'" in q
    for field in ["campaign.name", "segments.date", "metrics.impressions",
                  "metrics.clicks", "metrics.cost_micros", "metrics.conversions"]:
        assert field in q
    assert "FROM campaign" in q


def test_digits_normalizes_customer_ids():
    assert ads.digits("123-456-7890") == "1234567890"
    assert ads.digits("1234567890") == "1234567890"


def test_configured_clients_skips_missing_ids():
    clients = {
        "a": {"ga4_property": "1", "google_ads_customer_id": "111-222-3333"},
        "b": {"ga4_property": "2"},
        "c": {"ga4_property": "3", "google_ads_customer_id": ""},
    }
    assert ads.configured_clients(clients) == {"a": "1112223333"}


def test_current_clients_yaml_has_no_ads_ids_yet():
    # All customer ids are currently unknown (commented template) — the
    # extractor must therefore be a configured no-op. Delete this test when
    # the first real id lands in clients.yaml.
    from extract_ga4 import load_clients
    assert ads.configured_clients(load_clients()) == {}


def test_api_version_default_and_override(monkeypatch):
    monkeypatch.delenv("GOOGLE_ADS_API_VERSION", raising=False)
    assert ads.api_version() == "v24"
    monkeypatch.setenv("GOOGLE_ADS_API_VERSION", "v25")
    assert ads.api_version() == "v25"


def test_upsert_ad_spend_idempotent(tmp_path, monkeypatch, chunks):
    monkeypatch.setattr(ingest, "DATA_DIR", str(tmp_path))
    rows = ads.ads_rows(chunks)
    r1 = ingest.upsert("acme", "ad_spend", "2026-07-01", "2026-07-02", pd.DataFrame(rows))
    r2 = ingest.upsert("acme", "ad_spend", "2026-07-01", "2026-07-02", pd.DataFrame(rows))
    assert r1["rows_total"] == len(rows) == r2["rows_total"]
