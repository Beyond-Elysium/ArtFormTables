"""Token matching (ai_tokens.py) + the ai_traffic daily transform.

ai_tokens.py mirrors app/lib/connectors/aiSources.ts — if these tests drift
from aiSources.test.ts expectations, the two lists are out of sync.
"""

import json
import os

import pytest

import ai_tokens
import extract_ga4

FIXTURES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures")


@pytest.fixture()
def ai_payload() -> dict:
    with open(os.path.join(FIXTURES_DIR, "ga4_ai_report.json")) as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# match_ai_source
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("source,expected_id", [
    ("chatgpt.com", "chatgpt"),
    ("chat.openai.com", "chatgpt"),
    ("ChatGPT.com / referral", "chatgpt"),      # case-insensitive
    ("perplexity.ai", "perplexity"),
    ("gemini.google.com", "gemini"),
    ("bard.google.com", "gemini"),
    ("copilot.microsoft.com", "copilot"),
    ("edgeservices.bing.com", "copilot"),
    ("claude.ai", "claude"),
    ("grok.com", "grok"),
    ("x.ai", "grok"),
    ("chat.deepseek.com", "deepseek"),
    ("meta.ai", "meta-ai"),
    ("chat.mistral.ai", "mistral"),
    ("you.com", "you"),
    ("poe.com", "poe"),
    ("phind.com", "phind"),
])
def test_known_ai_hosts_match(source, expected_id):
    matched = ai_tokens.match_ai_source(source)
    assert matched is not None and matched[0] == expected_id


@pytest.mark.parametrize("source", [
    "google", "bing.com", "duckduckgo.com", "facebook.com", "(direct)", "", None,
])
def test_non_ai_hosts_do_not_match(source):
    assert ai_tokens.match_ai_source(source) is None
    assert not ai_tokens.is_ai_source(source)


def test_first_match_wins_ordering():
    # "openai" (chatgpt) is listed before any later token that could also hit.
    assert ai_tokens.match_ai_source("openai.com")[0] == "chatgpt"


def test_token_list_is_flat_and_ordered():
    # Must mirror aiSources.ts AI_SOURCE_TOKENS exactly.
    assert ai_tokens.AI_SOURCE_TOKENS == [
        "chatgpt", "openai", "perplexity", "gemini", "bard",
        "copilot", "edgeservices", "bingapis", "claude.ai", "anthropic",
        "grok", "x.ai", "deepseek", "meta.ai", "mistral", "lechat",
        "you.com", "poe.com", "phind",
    ]


# ---------------------------------------------------------------------------
# ai_daily_rows transform
# ---------------------------------------------------------------------------

def test_ai_daily_rows_aggregates_per_day(ai_payload):
    totals = {"2026-07-01": 200, "2026-07-02": 150}
    rows = extract_ga4.ai_daily_rows(ai_payload, totals)
    assert rows == [
        {
            "date": "2026-07-01",
            # chatgpt.com(5) + chat.openai.com(3) + perplexity(2) + copilot(1);
            # duckduckgo.com is dropped by the token re-check
            "ai_sessions": 11,
            "total_sessions": 200,
            "ai_engaged": 7,
            "distinct_ai_sources": 3,   # chatgpt (2 hosts -> 1), perplexity, copilot
            "distinct_ai_pages": 3,     # {/, /pricing, /blog/ai-seo}
        },
        {
            "date": "2026-07-02",
            "ai_sessions": 4,
            "total_sessions": 150,
            "ai_engaged": 3,
            "distinct_ai_sources": 1,
            "distinct_ai_pages": 1,
        },
    ]


def test_ai_daily_rows_zero_fills_dates_with_no_ai_traffic(ai_payload):
    totals = {"2026-07-01": 200, "2026-07-02": 150, "2026-07-03": 90}
    rows = extract_ga4.ai_daily_rows(ai_payload, totals)
    assert rows[-1] == {
        "date": "2026-07-03",
        "ai_sessions": 0,
        "total_sessions": 90,
        "ai_engaged": 0,
        "distinct_ai_sources": 0,
        "distinct_ai_pages": 0,
    }


def test_ai_daily_rows_empty_payload_still_covers_traffic_dates():
    rows = extract_ga4.ai_daily_rows({}, {"2026-07-01": 10})
    assert rows == [{
        "date": "2026-07-01", "ai_sessions": 0, "total_sessions": 10,
        "ai_engaged": 0, "distinct_ai_sources": 0, "distinct_ai_pages": 0,
    }]


def test_ai_request_has_server_side_token_filter():
    req = extract_ga4.ai_request("2026-01-01", "2026-01-31")
    assert [d["name"] for d in req["dimensions"]] == [
        "date", "sessionSource", "landingPagePlusQueryString",
    ]
    assert [m["name"] for m in req["metrics"]] == ["sessions", "engagedSessions"]
    exprs = req["dimensionFilter"]["orGroup"]["expressions"]
    values = [e["filter"]["stringFilter"]["value"] for e in exprs]
    assert values == ai_tokens.AI_SOURCE_TOKENS
    assert all(e["filter"]["fieldName"] == "sessionSource" for e in exprs)


def test_totals_from_traffic_sums_channels_per_date():
    rows = [
        {"date": "2026-07-01", "sessions": 120},
        {"date": "2026-07-01", "sessions": 80},
        {"date": "2026-07-02", "sessions": 130},
    ]
    assert extract_ga4.totals_from_traffic(rows) == {"2026-07-01": 200, "2026-07-02": 130}
