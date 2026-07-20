#!/usr/bin/env bash
# Daily pipeline for the semantic VM: extract (incremental, all clients)
# -> rollups -> health assertions. Logs to store/logs/pipeline-<date>.log,
# fails loudly on the first broken step, and is safe to re-run (extraction is
# idempotent; a same-day re-run holds row counts steady, which health accepts).
#
# Install: see INGESTION.md §8 (systemd service + timer in deploy/).
#
# Env (usually via /etc/artform-semantic.env, loaded by the systemd unit):
#   GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET / GOOGLE_OAUTH_REFRESH_TOKEN
#   SEMANTIC_PYTHON       override the interpreter (default: ./.venv/bin/python, else python3)
#   SEMANTIC_LOG_DIR      override the log dir (default: ./store/logs)
#   SEMANTIC_RELOAD_CMD   optional command run after a successful pipeline, e.g.
#                         "systemctl restart artform-semantic" — the FastAPI
#                         service caches models at startup and needs a nudge to
#                         see new specs/rollups.
set -euo pipefail

SEMANTIC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SEMANTIC_DIR"

LOG_DIR="${SEMANTIC_LOG_DIR:-$SEMANTIC_DIR/store/logs}"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/pipeline-$(date -u +%Y-%m-%d).log"
exec > >(tee -a "$LOG_FILE") 2>&1

PYTHON="${SEMANTIC_PYTHON:-}"
if [[ -z "$PYTHON" ]]; then
  if [[ -x "$SEMANTIC_DIR/.venv/bin/python" ]]; then
    PYTHON="$SEMANTIC_DIR/.venv/bin/python"
  else
    PYTHON="$(command -v python3)"
  fi
fi

log() { printf '%s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }

CURRENT_STEP="(startup)"
on_err() {
  log "[pipeline] FAILED at step: $CURRENT_STEP — see $LOG_FILE"
  exit 1
}
trap on_err ERR

step() {
  CURRENT_STEP="$1"; shift
  log "[pipeline] step: $CURRENT_STEP"
  "$@"
}

log "[pipeline] start (python: $PYTHON, dir: $SEMANTIC_DIR)"

# 1. Extract — incremental window (last 7 days through yesterday) for every
#    client in clients.yaml. Idempotent: overlapping windows never duplicate.
step "extract-ga4 (incremental, all clients)" "$PYTHON" extract_ga4.py --incremental

# 2. Daily -> monthly rollups for every source in the lake.
step "rollups" "$PYTHON" rollups.py

# 3. Health: rows exist, count didn't shrink, latest date == yesterday.
step "health" "$PYTHON" health_check.py --source ga4 --source ai_traffic

if [[ -n "${SEMANTIC_RELOAD_CMD:-}" ]]; then
  step "reload-semantic-service" bash -c "$SEMANTIC_RELOAD_CMD"
fi

log "[pipeline] OK — all steps passed (log: $LOG_FILE)"
