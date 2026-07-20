#!/usr/bin/env python3
"""
Google Ads -> Parquet lake extractor (ad spend for blended metrics).

Pulls daily cost/clicks/impressions/conversions per client into the idempotent
lake via `ingest.upsert()` — source **"ad_spend"**, grain
`client x date x platform x campaign`, columns aligned with what
`build_blended.py` / `specs/blended.yaml` consume:

    date, platform ("Google"), campaign,
    impressions, clicks, spend (cost_micros / 1e6), conversions

Auth — REST `googleAds:searchStream`, no SDK. Same OAuth Web client/refresh
token as GA4 plus the Ads developer token (env fallbacks mirror
app/lib/connectors/googleAds.ts):

    GOOGLE_ADS_DEVELOPER_TOKEN                       (required for live runs)
    GOOGLE_ADS_CLIENT_ID        | GOOGLE_OAUTH_CLIENT_ID
    GOOGLE_ADS_CLIENT_SECRET    | GOOGLE_OAUTH_CLIENT_SECRET
    GOOGLE_ADS_OAUTH_REFRESH_TOKEN | GOOGLE_OAUTH_REFRESH_TOKEN
    GOOGLE_ADS_LOGIN_CUSTOMER_ID                     (optional, MCC)
    GOOGLE_ADS_API_VERSION                           (default v24; Ads API
        versions sunset ~yearly — bump before sunset)

Per-client customer ids come from `clients.yaml` (`google_ads_customer_id`,
currently all unknown/commented). When the developer token or every customer id
is missing, the extractor prints a notice and exits 0 so `pipeline.sh` keeps
working before Ads access lands.

CLI mirrors extract_ga4.py:

    python extract_google_ads.py                    # backfill: last 365 days
    python extract_google_ads.py --incremental      # last 7 days through yesterday
    python extract_google_ads.py --client artform --since 2026-01-01 --until 2026-06-30

The searchStream-JSON -> rows transform (`ads_rows`) is a pure function,
unit-tested against a canned fixture — no network.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

import pandas as pd

import ingest
from extract_ga4 import load_clients, resolve_window

SOURCE = "ad_spend"
PLATFORM = "Google"           # build_blended maps platform -> channel (PLATFORM_CHANNEL)
MAX_RETRIES = 5
BACKOFF_BASE_S = 5.0

TOKEN_URL = "https://oauth2.googleapis.com/token"
ADS_BASE = "https://googleads.googleapis.com"


def api_version() -> str:
    return os.environ.get("GOOGLE_ADS_API_VERSION", "v24")


# --------------------------------------------------------------------------- #
# Auth / config (env fallbacks mirror app/lib/connectors/googleAds.ts)
# --------------------------------------------------------------------------- #

def _env(primary: str, fallback: str) -> str | None:
    return os.environ.get(primary) or os.environ.get(fallback)


def oauth_env() -> tuple[str | None, str | None, str | None]:
    return (
        _env("GOOGLE_ADS_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_ID"),
        _env("GOOGLE_ADS_CLIENT_SECRET", "GOOGLE_OAUTH_CLIENT_SECRET"),
        _env("GOOGLE_ADS_OAUTH_REFRESH_TOKEN", "GOOGLE_OAUTH_REFRESH_TOKEN"),
    )


def get_access_token() -> str:
    """Refresh-token -> access-token exchange with the Ads env fallbacks."""
    client_id, client_secret, refresh_token = oauth_env()
    missing = [n for n, v in [
        ("GOOGLE_ADS_CLIENT_ID|GOOGLE_OAUTH_CLIENT_ID", client_id),
        ("GOOGLE_ADS_CLIENT_SECRET|GOOGLE_OAUTH_CLIENT_SECRET", client_secret),
        ("GOOGLE_ADS_OAUTH_REFRESH_TOKEN|GOOGLE_OAUTH_REFRESH_TOKEN", refresh_token),
    ] if not v]
    if missing:
        raise SystemExit(f"[extract-ads] missing env: {', '.join(missing)}")
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
        raise SystemExit(f"[extract-ads] OAuth token exchange failed ({e.code}): {detail}")
    token = payload.get("access_token")
    if not token:
        raise SystemExit(f"[extract-ads] OAuth response had no access_token: {payload}")
    return token


def digits(customer_id: str) -> str:
    """'123-456-7890' or '1234567890' -> '1234567890' (API path form)."""
    return re.sub(r"\D", "", str(customer_id))


def configured_clients(clients: dict[str, dict]) -> dict[str, str]:
    """{slug: customer_id_digits} for clients with a google_ads_customer_id."""
    out = {}
    for slug, cfg in clients.items():
        cid = digits(str((cfg or {}).get("google_ads_customer_id") or ""))
        if cid:
            out[slug] = cid
    return out


# --------------------------------------------------------------------------- #
# GAQL + pure transform (unit-tested against a canned fixture)
# --------------------------------------------------------------------------- #

def gaql(since: str, until: str) -> str:
    """Daily per-campaign spend metrics, aligned with the ad_spend columns."""
    return (
        "SELECT campaign.name, segments.date, "
        "metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions "
        "FROM campaign "
        f"WHERE segments.date BETWEEN '{since}' AND '{until}'"
    )


def _num(v: object) -> float:
    return float(v or 0)


def ads_rows(chunks: list[dict]) -> list[dict]:
    """searchStream response (list of result chunks) -> lake rows.

    Aggregates to (date, campaign) in case the API splits a day across
    responses; column names match seed_blended.py's demo ad_spend so
    build_blended.py / specs/blended.yaml work unchanged (platform "Google"
    -> channel via PLATFORM_CHANNEL).
    """
    agg: dict[tuple[str, str], dict] = {}
    for chunk in chunks or []:
        for result in chunk.get("results", []) or []:
            d = str((result.get("segments") or {}).get("date") or "")
            campaign = str((result.get("campaign") or {}).get("name") or "(unnamed)")
            if not d:
                continue
            m = result.get("metrics") or {}
            row = agg.setdefault((d, campaign), {
                "date": d, "platform": PLATFORM, "campaign": campaign,
                "impressions": 0, "clicks": 0, "spend": 0.0, "conversions": 0.0,
            })
            row["impressions"] += int(_num(m.get("impressions")))
            row["clicks"] += int(_num(m.get("clicks")))
            row["spend"] += _num(m.get("costMicros")) / 1e6
            row["conversions"] += _num(m.get("conversions"))
    rows = [dict(r, spend=round(r["spend"], 2), conversions=round(r["conversions"], 2))
            for r in agg.values()]
    return sorted(rows, key=lambda r: (r["date"], r["campaign"]))


# --------------------------------------------------------------------------- #
# HTTP + extraction driver
# --------------------------------------------------------------------------- #

def search_stream(token: str, customer_id: str, query: str) -> list[dict]:
    """POST googleAds:searchStream; returns the list of result chunks."""
    url = f"{ADS_BASE}/{api_version()}/customers/{customer_id}/googleAds:searchStream"
    headers = {
        "Authorization": f"Bearer {token}",
        "developer-token": os.environ["GOOGLE_ADS_DEVELOPER_TOKEN"],
        "Content-Type": "application/json",
    }
    login_cid = os.environ.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID")
    if login_cid:
        headers["login-customer-id"] = digits(login_cid)
    data = json.dumps({"query": query}).encode()

    for attempt in range(MAX_RETRIES):
        req = urllib.request.Request(url, data=data, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=300) as res:
                payload = json.load(res)
                return payload if isinstance(payload, list) else [payload]
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="replace")
            if e.code in (429, 500, 503) and attempt < MAX_RETRIES - 1:
                retry_after = e.headers.get("Retry-After")
                delay = float(retry_after) if retry_after else min(300.0, BACKOFF_BASE_S * 2 ** attempt)
                print(f"[extract-ads] HTTP {e.code}; retry {attempt + 1}/{MAX_RETRIES - 1} "
                      f"in {delay:.0f}s", file=sys.stderr)
                time.sleep(delay)
                continue
            hint = ""
            if e.code == 404 or "unsupported version" in body.lower():
                hint = (f" — API version {api_version()!r} may be sunset; "
                        "set GOOGLE_ADS_API_VERSION=vNN (see "
                        "developers.google.com/google-ads/api/docs/sunset-dates)")
            raise SystemExit(f"[extract-ads] HTTP {e.code} from {url}: {body[:500]}{hint}")
    raise SystemExit(f"[extract-ads] exhausted retries for {url}")


def extract_client(token: str, slug: str, customer_id: str, since: str, until: str) -> None:
    chunks = search_stream(token, customer_id, gaql(since, until))
    rows = ads_rows(chunks)
    if not rows:
        print(f"[extract-ads] {slug}: 0 ad_spend rows for {since}..{until} — nothing ingested")
        return
    res = ingest.upsert(slug, SOURCE, since, until, pd.DataFrame(rows))
    print(f"[extract-ads] {slug}/{SOURCE} [{since}..{until}]: "
          f"+{res['rows_in']} rows -> {res['rows_total']} total ({res['path']})")


def main() -> None:
    ap = argparse.ArgumentParser(description="Extract daily Google Ads spend per client into the Parquet lake.")
    ap.add_argument("--client", help="limit to one client slug (default: all with a customer id)")
    ap.add_argument("--since", help="window start YYYY-MM-DD (default: 365 days before --until)")
    ap.add_argument("--until", help="window end YYYY-MM-DD, inclusive (default: yesterday)")
    ap.add_argument("--incremental", action="store_true", help="shortcut: last 7 days through yesterday")
    ap.add_argument("--sleep", type=float, default=2.0,
                    help="seconds to sleep between customers (default 2)")
    args = ap.parse_args()

    # Graceful "not configured" exits (0) keep pipeline.sh green pre-Ads-access.
    if not os.environ.get("GOOGLE_ADS_DEVELOPER_TOKEN"):
        print("[extract-ads] GOOGLE_ADS_DEVELOPER_TOKEN not set — ad-spend extraction "
              "skipped (configure it + clients.yaml google_ads_customer_id to enable)")
        return
    clients = load_clients()
    targets = configured_clients(clients)
    if args.client:
        if args.client not in clients:
            raise SystemExit(f"[extract-ads] unknown client {args.client!r}; know: {', '.join(sorted(clients))}")
        if args.client not in targets:
            raise SystemExit(f"[extract-ads] client {args.client!r} has no google_ads_customer_id in clients.yaml")
        targets = {args.client: targets[args.client]}
    if not targets:
        print("[extract-ads] no google_ads_customer_id configured for any client in "
              "clients.yaml — ad-spend extraction skipped")
        return

    since, until = resolve_window(args.since, args.until, args.incremental)
    token = get_access_token()
    print(f"[extract-ads] window {since}..{until}, {len(targets)} client(s), API {api_version()}")
    for i, (slug, cid) in enumerate(sorted(targets.items())):
        if i > 0 and args.sleep > 0:
            time.sleep(args.sleep)
        extract_client(token, slug, cid, since, until)
    print("[extract-ads] done")


if __name__ == "__main__":
    main()
