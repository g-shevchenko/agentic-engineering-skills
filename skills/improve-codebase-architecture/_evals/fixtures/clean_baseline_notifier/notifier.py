"""Tiny notification fan-out: post a message to Slack and/or Telegram.

Channel config is read from the environment at import. Each `send_*` returns
True on success and raises RuntimeError on a misconfigured channel or a
non-2xx response; `get_last_status()` reports the most recent send outcome.
"""
import os
import time

import requests

# Configuration at the edge (read once at import) — the recommended pattern.
SLACK_WEBHOOK = os.environ.get("SLACK_WEBHOOK_URL", "")
TELEGRAM_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT = os.environ.get("TELEGRAM_CHAT_ID", "")
TIMEOUT_S = float(os.environ.get("NOTIFY_TIMEOUT_S", "5"))

_last = {"channel": None, "ok": None, "at": 0.0}


def send_slack(text: str) -> bool:
    """Post `text` to the configured Slack incoming webhook."""
    if not SLACK_WEBHOOK:
        raise RuntimeError("SLACK_WEBHOOK_URL not configured")
    r = requests.post(
        SLACK_WEBHOOK,
        json={"text": text},
        headers={"Content-Type": "application/json"},
        timeout=TIMEOUT_S,
    )
    ok = r.status_code < 300
    _last.update(channel="slack", ok=ok, at=time.time())
    if not ok:
        raise RuntimeError(f"slack {r.status_code}: {r.text[:200]}")
    return ok


def send_telegram(text: str) -> bool:
    """Post `text` to the configured Telegram bot chat."""
    if not (TELEGRAM_TOKEN and TELEGRAM_CHAT):
        raise RuntimeError("TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not configured")
    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
    r = requests.post(
        url,
        json={"chat_id": TELEGRAM_CHAT, "text": text},
        headers={"Content-Type": "application/json"},
        timeout=TIMEOUT_S,
    )
    ok = r.status_code < 300
    _last.update(channel="telegram", ok=ok, at=time.time())
    if not ok:
        raise RuntimeError(f"telegram {r.status_code}: {r.text[:200]}")
    return ok


def get_last_status() -> dict:
    """Return a copy of the most recent send outcome."""
    return dict(_last)
