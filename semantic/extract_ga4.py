#!/usr/bin/env python3
"""
GA4 -> Parquet lake extractor (the first real extractor).

Pulls daily GA4 metrics per client into the idempotent Parquet lake via
`ingest.upsert()` — source "ga4", grain client x date x channel:

    date, channel (sessionDefaultChannelGroup),
    sessions, users (totalUsers), page_views (screenPageViews),
    conversions (keyEvents), engaged_sessions (sessions x engagementRate)

`engagementRate` is a ratio, so it is NOT stored as-is (ratios don't sum).
Instead we reconstruct the additive `engaged_sessions` (GA4 defines
engagementRate = engagedSessions / sessions), and `specs/ga4.yaml` re-derives
engagement_rate as sum(engaged_sessions)/sum(sessions), correct at any grain.

Auth — the same Google OAuth Web client + refresh token the Next app uses:

    GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET / GOOGLE_OAUTH_REFRESH_TOKEN

The refresh token is exchanged for an access token, and the GA4 Data API is
called over plain REST (`runReport`) — no SDK. Client slugs -> GA4 property ids
come from `clients.yaml` (keep in sync with app/config/clients.ts).

CLI
---
    python extract_ga4.py                     # backfill: last 365 days, all clients
    python extract_ga4.py --incremental       # last 7 days through yesterday
    python extract_ga4.py --client artform --since 2025-01-01 --until 2025-06-30
    python extract_ga4.py --skip-ai           # traffic table only (no ai_traffic)

Idempotent: re-running any window replaces exactly that (client, source, window)
slice (see ingest.py), so overlapping/backfill/incremental runs never duplicate.
Quota-friendly: sleeps between properties, retries 429/5xx with backoff.

Each client also gets a daily **ai_traffic** table (source "ai_traffic", model
"ai" via specs/ai.yaml): ai_sessions, total_sessions, ai_engaged,
distinct_ai_sources, distinct_ai_pages — the stored signals behind the AI Score
trendline. AI referrals are detected with the token list in ai_tokens.py
(mirrors app/lib/connectors/aiSources.ts).

The API-response -> rows transforms (`traffic_rows`, `ai_daily_rows`, …) are
pure functions, unit-tested against canned fixtures in tests/ — no network.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, timedelta

import pandas as pd
import yaml

import ingest
from ai_tokens import AI_SOURCE_TOKENS, match_ai_source

HERE = os.path.dirname(os.path.abspath(__file__))
CLIENTS_YAML = os.path.join(HERE, "clients.yaml")

TOKEN_URL = "https://oauth2.googleapis.com/token"
GA4_BASE = "https://analyticsdata.googleapis.com/v1beta"

SOURCE = "ga4"                # lake source for the traffic table
AI_SOURCE = "ai_traffic"      # lake source for the daily AI-referral table (specs/ai.yaml)
PAGE_SIZE = 100_000           # GA4 caps limit at 250k; stay comfortably under
MAX_RETRIES = 5
BACKOFF_BASE_S = 5.0
DEFAULT_BACKFILL_DAYS = 365
INCREMENTAL_DAYS = 7          # re-pull a week to absorb late/restated GA4 data

# GA4 metric names for the traffic report, in request order.
TRAFFIC_METRICS = ["sessions", "totalUsers", "screenPageViews", "keyEvents", "engagementRate"]


# --------------------------------------------------------------------------- #
# Config + auth
# --------------------------------------------------------------------------- #

def load_clients(path: str = CLIENTS_YAML) -> dict[str, dict]:
    """clients.yaml -> {slug: {ga4_property: ..., google_ads_customer_id?: ...}}."""
    with open(path) as f:
        doc = yaml.safe_load(f) or {}
    clients = doc.get("clients") or {}
    if not isinstance(clients, dict) or not clients:
        raise SystemExit(f"[extract-ga4] no clients found in {path}")
    return clients


def get_access_token() -> str:
    """Exchange the OAuth refresh token for a short-lived access token."""
    client_id = os.environ.get("GOOGLE_OAUTH_CLIENT_ID")
    client_secret = os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET")
    refresh_token = os.environ.get("GOOGLE_OAUTH_REFRESH_TOKEN")
    missing = [n for n, v in [
        ("GOOGLE_OAUTH_CLIENT_ID", client_id),
        ("GOOGLE_OAUTH_CLIENT_SECRET", client_secret),
        ("GOOGLE_OAUTH_REFRESH_TOKEN", refresh_token),
    ] if not v]
    if missing:
        raise SystemExit(f"[extract-ga4] missing env: {', '.join(missing)}")

    body = urllib.parse.urlencode({
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }).encode()
    req = urllib.request.Request(
        TOKEN_URL, data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            payload = json.load(res)
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")[:400]
        raise SystemExit(f"[extract-ga4] OAuth token exchange failed ({e.code}): {detail}")
    token = payload.get("access_token")
    if not token:
        raise SystemExit(f"[extract-ga4] OAuth response had no access_token: {payload}")
    return token


def _post_json(url: str, payload: dict, token: str) -> dict:
    """POST JSON with bearer auth; retry 429/5xx with exponential backoff."""
    data = json.dumps(payload).encode()
    for attempt in range(MAX_RETRIES):
        req = urllib.request.Request(url, data=data, headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        })
        try:
            with urllib.request.urlopen(req, timeout=120) as res:
                return json.load(res)
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="replace")
            if e.code in (429, 500, 503) and attempt < MAX_RETRIES - 1:
                retry_after = e.headers.get("Retry-After")
                delay = float(retry_after) if retry_after else min(300.0, BACKOFF_BASE_S * 2 ** attempt)
                print(f"[extract-ga4] HTTP {e.code} from {url.split('?')[0]}; "
                      f"retry {attempt + 1}/{MAX_RETRIES - 1} in {delay:.0f}s", file=sys.stderr)
                time.sleep(delay)
                continue
            raise SystemExit(f"[extract-ga4] HTTP {e.code} from {url}: {body[:500]}")
    raise SystemExit(f"[extract-ga4] exhausted retries for {url}")


def run_report(token: str, property_id: str, request: dict) -> dict:
    """GA4 Data API runReport with offset pagination; returns a merged payload."""
    url = f"{GA4_BASE}/properties/{property_id}:runReport"
    merged: dict | None = None
    offset = 0
    while True:
        page = dict(request, limit=str(PAGE_SIZE), offset=str(offset))
        payload = _post_json(url, page, token)
        rows = payload.get("rows", []) or []
        if merged is None:
            merged = payload
            merged["rows"] = list(rows)
        else:
            merged["rows"].extend(rows)
        if len(rows) < PAGE_SIZE:
            return merged
        offset += PAGE_SIZE


# --------------------------------------------------------------------------- #
# Pure transforms (unit-tested against canned fixtures; no network)
# --------------------------------------------------------------------------- #

def report_records(payload: dict) -> list[dict]:
    """Generic runReport payload -> [{header_name: raw_value_string, ...}]."""
    dims = [h["name"] for h in payload.get("dimensionHeaders", []) or []]
    mets = [h["name"] for h in payload.get("metricHeaders", []) or []]
    out = []
    for row in payload.get("rows", []) or []:
        rec: dict = {}
        for name, cell in zip(dims, row.get("dimensionValues", []) or []):
            rec[name] = cell.get("value", "")
        for name, cell in zip(mets, row.get("metricValues", []) or []):
            rec[name] = cell.get("value", "0")
        out.append(rec)
    return out


def iso_date(yyyymmdd: str) -> str:
    """GA4 'date' dimension (YYYYMMDD) -> ISO YYYY-MM-DD."""
    s = str(yyyymmdd)
    if len(s) == 8 and s.isdigit():
        return f"{s[0:4]}-{s[4:6]}-{s[6:8]}"
    return s  # already ISO (defensive)


def _int(v: object) -> int:
    return int(float(v or 0))


def traffic_rows(payload: dict) -> list[dict]:
    """runReport(date x channel) payload -> lake rows for source 'ga4'.

    Columns align with specs/ga4.yaml: totalUsers -> users, keyEvents ->
    conversions (keyEvents ARE GA4's conversions), screenPageViews ->
    page_views, and engagementRate -> additive engaged_sessions.
    """
    rows = []
    for rec in report_records(payload):
        sessions = _int(rec.get("sessions"))
        rate = float(rec.get("engagementRate") or 0)
        rows.append({
            "date": iso_date(rec.get("date", "")),
            "channel": rec.get("sessionDefaultChannelGroup") or "(other)",
            "users": _int(rec.get("totalUsers")),
            "sessions": sessions,
            "page_views": _int(rec.get("screenPageViews")),
            "conversions": _int(rec.get("keyEvents")),
            "engaged_sessions": int(round(sessions * rate)),
        })
    return rows


def traffic_request(since: str, until: str) -> dict:
    return {
        "dateRanges": [{"startDate": since, "endDate": until}],
        "dimensions": [{"name": "date"}, {"name": "sessionDefaultChannelGroup"}],
        "metrics": [{"name": m} for m in TRAFFIC_METRICS],
    }


def ai_request(since: str, until: str) -> dict:
    """date x sessionSource x landing page, server-side filtered to AI hosts.

    Mirrors app/lib/connectors/ga4.ts: the dimension filter keeps low-volume AI
    rows from being truncated by a row cap before we can count them. Matching is
    still re-verified row-by-row via ai_tokens.match_ai_source (belt & braces —
    a contains-filter can catch non-AI hosts embedding a token).
    """
    return {
        "dateRanges": [{"startDate": since, "endDate": until}],
        "dimensions": [
            {"name": "date"},
            {"name": "sessionSource"},
            {"name": "landingPagePlusQueryString"},
        ],
        "metrics": [{"name": "sessions"}, {"name": "engagedSessions"}],
        "dimensionFilter": {
            "orGroup": {
                "expressions": [
                    {"filter": {
                        "fieldName": "sessionSource",
                        "stringFilter": {
                            "matchType": "CONTAINS",
                            "value": tok,
                            "caseSensitive": False,
                        },
                    }}
                    for tok in AI_SOURCE_TOKENS
                ],
            },
        },
    }


def ai_daily_rows(ai_payload: dict, totals_by_date: dict[str, int]) -> list[dict]:
    """AI report payload + {date: total_sessions} -> daily ai_traffic rows.

    One row per date with the stored AI-score signals (see specs/ai.yaml):
    ai_sessions, total_sessions, ai_engaged, distinct_ai_sources,
    distinct_ai_pages. Dates with traffic but no AI referrals are zero-filled so
    the trendline is continuous.
    """
    per_day: dict[str, dict] = {}
    for rec in report_records(ai_payload):
        matched = match_ai_source(rec.get("sessionSource"))
        if matched is None:
            continue  # contains-filter false positive
        d = iso_date(rec.get("date", ""))
        agg = per_day.setdefault(d, {"ai_sessions": 0, "ai_engaged": 0,
                                     "sources": set(), "pages": set()})
        agg["ai_sessions"] += _int(rec.get("sessions"))
        agg["ai_engaged"] += _int(rec.get("engagedSessions"))
        agg["sources"].add(matched[0])
        page = rec.get("landingPagePlusQueryString") or ""
        if page:
            agg["pages"].add(page)

    dates = sorted(set(totals_by_date) | set(per_day))
    rows = []
    for d in dates:
        agg = per_day.get(d, {"ai_sessions": 0, "ai_engaged": 0, "sources": set(), "pages": set()})
        rows.append({
            "date": d,
            "ai_sessions": agg["ai_sessions"],
            "total_sessions": int(totals_by_date.get(d, 0)),
            "ai_engaged": agg["ai_engaged"],
            "distinct_ai_sources": len(agg["sources"]),
            "distinct_ai_pages": len(agg["pages"]),
        })
    return rows


def totals_from_traffic(rows: list[dict]) -> dict[str, int]:
    """Traffic lake rows -> {date: total sessions across channels}."""
    totals: dict[str, int] = {}
    for r in rows:
        totals[r["date"]] = totals.get(r["date"], 0) + int(r["sessions"])
    return totals


# --------------------------------------------------------------------------- #
# Extraction driver
# --------------------------------------------------------------------------- #

def extract_client(token: str, slug: str, property_id: str,
                   since: str, until: str, skip_ai: bool = False) -> None:
    payload = run_report(token, property_id, traffic_request(since, until))
    rows = traffic_rows(payload)
    if not rows:
        print(f"[extract-ga4] {slug}: 0 traffic rows for {since}..{until} — nothing ingested")
    else:
        res = ingest.upsert(slug, SOURCE, since, until, pd.DataFrame(rows))
        print(f"[extract-ga4] {slug}/{SOURCE} [{since}..{until}]: "
              f"+{res['rows_in']} rows -> {res['rows_total']} total ({res['path']})")

    if skip_ai:
        return
    ai_payload = run_report(token, property_id, ai_request(since, until))
    ai_rows = ai_daily_rows(ai_payload, totals_from_traffic(rows))
    if not ai_rows:
        print(f"[extract-ga4] {slug}: 0 ai_traffic rows for {since}..{until} — nothing ingested")
        return
    res = ingest.upsert(slug, AI_SOURCE, since, until, pd.DataFrame(ai_rows))
    print(f"[extract-ga4] {slug}/{AI_SOURCE} [{since}..{until}]: "
          f"+{res['rows_in']} rows -> {res['rows_total']} total ({res['path']})")


def resolve_window(since: str | None, until: str | None, incremental: bool) -> tuple[str, str]:
    """Default: 365-day backfill ending yesterday; --incremental: last 7 days."""
    end = date.fromisoformat(until) if until else date.today() - timedelta(days=1)
    if since:
        start = date.fromisoformat(since)
    else:
        days = INCREMENTAL_DAYS if incremental else DEFAULT_BACKFILL_DAYS
        start = end - timedelta(days=days - 1)
    if start > end:
        raise SystemExit(f"[extract-ga4] --since {start} is after --until {end}")
    return start.isoformat(), end.isoformat()


def main() -> None:
    ap = argparse.ArgumentParser(description="Extract daily GA4 metrics per client into the Parquet lake.")
    ap.add_argument("--client", help="limit to one client slug (default: all in clients.yaml)")
    ap.add_argument("--since", help="window start YYYY-MM-DD (default: 365 days before --until)")
    ap.add_argument("--until", help="window end YYYY-MM-DD, inclusive (default: yesterday)")
    ap.add_argument("--incremental", action="store_true",
                    help=f"shortcut: last {INCREMENTAL_DAYS} days through yesterday")
    ap.add_argument("--sleep", type=float, default=2.0,
                    help="seconds to sleep between properties (GA4 quota kindness; default 2)")
    ap.add_argument("--skip-ai", action="store_true",
                    help="only extract the traffic table (skip the ai_traffic table)")
    args = ap.parse_args()

    since, until = resolve_window(args.since, args.until, args.incremental)
    clients = load_clients()
    if args.client:
        if args.client not in clients:
            raise SystemExit(f"[extract-ga4] unknown client {args.client!r}; know: {', '.join(sorted(clients))}")
        clients = {args.client: clients[args.client]}

    token = get_access_token()
    print(f"[extract-ga4] window {since}..{until}, {len(clients)} client(s)")
    for i, (slug, cfg) in enumerate(sorted(clients.items())):
        prop = str((cfg or {}).get("ga4_property") or "").strip()
        if not prop:
            print(f"[extract-ga4] {slug}: no ga4_property in clients.yaml — skipped")
            continue
        if i > 0 and args.sleep > 0:
            time.sleep(args.sleep)
        extract_client(token, slug, prop, since, until, skip_ai=args.skip_ai)
    print("[extract-ga4] done")


if __name__ == "__main__":
    main()
