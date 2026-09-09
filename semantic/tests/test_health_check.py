"""health_check.py assertions: presence, growth, freshness, per-client rows."""

import json
import os
from datetime import date, timedelta

import pandas as pd
import pytest

import health_check


def _write_lake(data_dir, client, source, dates, rows_per_date=2):
    os.makedirs(os.path.join(data_dir, client), exist_ok=True)
    rows = [
        {"client": client, "date": d, "channel": f"ch{i}", "sessions": 10 + i}
        for d in dates
        for i in range(rows_per_date)
    ]
    pd.DataFrame(rows).to_parquet(os.path.join(data_dir, client, f"{source}.parquet"), index=False)
    return len(rows)


@pytest.fixture()
def lake(tmp_path, monkeypatch):
    data_dir = str(tmp_path / "data")
    store_dir = str(tmp_path / "store")
    monkeypatch.setattr(health_check, "DATA_DIR", data_dir)
    monkeypatch.setattr(health_check, "STORE_DIR", store_dir)
    monkeypatch.setattr(health_check, "STATE_FILE", os.path.join(store_dir, "pipeline_state.json"))
    return data_dir


def _run(sources, **kw):
    state = health_check._load_state()
    failures = []
    for s in sources:
        health_check.check_source(s, state, kw.get("max_lag_days", 1),
                                  kw.get("require_clients", False), failures)
    return state, failures


def test_fresh_lake_passes_and_records_state(lake):
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    n = _write_lake(lake, "acme", "ga4", [yesterday])
    state, failures = _run(["ga4"])
    assert failures == []
    assert state["ga4"]["rows"] == n
    assert state["ga4"]["latest"] == yesterday


def test_missing_source_fails(lake):
    _, failures = _run(["ga4"])
    assert failures and "no rows" in failures[0]


def test_stale_lake_fails_freshness(lake):
    old = (date.today() - timedelta(days=5)).isoformat()
    _write_lake(lake, "acme", "ga4", [old])
    _, failures = _run(["ga4"])
    assert any("stale" in f for f in failures)
    # a generous lag allowance passes
    _, failures = _run(["ga4"], max_lag_days=10)
    assert failures == []


def test_shrunken_row_count_fails(lake):
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    day_before = (date.today() - timedelta(days=2)).isoformat()
    _write_lake(lake, "acme", "ga4", [day_before, yesterday])
    state, failures = _run(["ga4"])
    assert failures == []
    health_check._save_state(state)

    _write_lake(lake, "acme", "ga4", [yesterday])  # fewer rows than recorded
    _, failures = _run(["ga4"])
    assert any("shrank" in f for f in failures)


def test_equal_row_count_rerun_passes(lake):
    """Safe to re-run: a same-day second run holds counts steady and passes."""
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    _write_lake(lake, "acme", "ga4", [yesterday])
    state, failures = _run(["ga4"])
    assert failures == []
    health_check._save_state(state)
    _, failures = _run(["ga4"])
    assert failures == []


def test_require_clients_flags_missing_client(lake, tmp_path, monkeypatch):
    clients_yaml = tmp_path / "clients.yaml"
    clients_yaml.write_text(
        "clients:\n"
        "  acme:\n    ga4_property: \"1\"\n"
        "  globex:\n    ga4_property: \"2\"\n"
    )
    monkeypatch.setattr(health_check, "CLIENTS_YAML", str(clients_yaml))
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    _write_lake(lake, "acme", "ga4", [yesterday])

    _, failures = _run(["ga4"], require_clients=True)
    assert any("globex" in f for f in failures)
    assert not any("'acme'" in f for f in failures)


def test_state_file_round_trip(lake):
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    _write_lake(lake, "acme", "ga4", [yesterday])
    state, failures = _run(["ga4"])
    assert failures == []
    health_check._save_state(state)
    with open(health_check.STATE_FILE) as f:
        on_disk = json.load(f)
    assert on_disk["ga4"]["rows"] == state["ga4"]["rows"]
