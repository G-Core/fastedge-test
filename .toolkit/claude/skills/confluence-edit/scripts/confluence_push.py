#!/usr/bin/env python3
"""Push HTML content to a Confluence page via REST API.

Reads credentials from ~/.secrets.env (CONFLUENCE_URL, CONFLUENCE_PERSONAL_TOKEN).
Fetches the current page version, increments it, and PUTs the new content.
"""

from __future__ import annotations

import argparse
import json
import logging
import urllib.error
import urllib.request
from collections.abc import Callable, Mapping, Sequence
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)

DEFAULT_ENV_FILE = Path("~/.secrets.env").expanduser()


# ---------------------------------------------------------------------------
# Secrets
# ---------------------------------------------------------------------------

def load_secrets(
    env_file: Path = DEFAULT_ENV_FILE,
    file_reader: Callable[[Path], str] | None = None,
) -> dict[str, str]:
    """Parse KEY=VALUE pairs from an env file, skipping comments and blanks."""
    if file_reader is None:
        file_reader = lambda p: p.read_text(encoding="utf-8")

    secrets: dict[str, str] = {}
    for line in file_reader(env_file).splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        secrets[k.strip()] = v.strip()
    return secrets


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

HttpCaller = Callable[[urllib.request.Request], Any]


def _default_http_call(req: urllib.request.Request) -> Any:
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def api_get(
    url: str,
    token: str,
    *,
    http_caller: HttpCaller | None = None,
) -> dict[str, Any]:
    """GET a JSON resource from Confluence."""
    if http_caller is None:
        http_caller = _default_http_call

    req = urllib.request.Request(url)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Accept", "application/json")
    return http_caller(req)


def api_put(
    url: str,
    token: str,
    payload: Mapping[str, Any],
    *,
    http_caller: HttpCaller | None = None,
) -> dict[str, Any]:
    """PUT a JSON payload to Confluence."""
    if http_caller is None:
        http_caller = _default_http_call

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="PUT")
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json")
    req.add_header("Accept", "application/json")
    return http_caller(req)


# ---------------------------------------------------------------------------
# Core logic
# ---------------------------------------------------------------------------

def build_update_payload(
    page_id: str,
    title: str,
    html: str,
    next_version: int,
    comment: str | None = None,
) -> dict[str, Any]:
    """Build the JSON payload for a Confluence page update."""
    payload: dict[str, Any] = {
        "id": page_id,
        "type": "page",
        "title": title,
        "body": {
            "storage": {
                "value": html,
                "representation": "storage",
            },
        },
        "version": {
            "number": next_version,
        },
    }
    if comment:
        payload["version"]["message"] = comment
    return payload


def push_page(
    page_id: str,
    html: str,
    base_url: str,
    token: str,
    comment: str | None = None,
    *,
    http_caller: HttpCaller | None = None,
) -> int:
    """Fetch current version, increment, and push new content.

    Returns the new version number.
    """
    info = api_get(
        f"{base_url}/rest/api/content/{page_id}?expand=version",
        token,
        http_caller=http_caller,
    )
    current_version: int = info["version"]["number"]
    title: str = info["title"]

    log.info("Page: %s", title)
    log.info("Current version: %d", current_version)
    log.info("HTML size: %d chars", len(html))

    payload = build_update_payload(
        page_id, title, html, current_version + 1, comment,
    )

    result = api_put(
        f"{base_url}/rest/api/content/{page_id}",
        token,
        payload,
        http_caller=http_caller,
    )
    new_version: int = result["version"]["number"]
    log.info("Updated to version: %d", new_version)
    return new_version


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Push HTML content to a Confluence page via REST API",
    )
    parser.add_argument("page_id", help="Confluence page ID")
    parser.add_argument(
        "html_file", type=Path, help="Path to HTML file with new content",
    )
    parser.add_argument(
        "--comment", default=None, help="Version comment for the edit",
    )
    parser.add_argument(
        "--env-file", type=Path, default=DEFAULT_ENV_FILE,
        help="Path to .env file with CONFLUENCE_URL and CONFLUENCE_PERSONAL_TOKEN",
    )
    parser.add_argument("-v", "--verbose", action="count", default=0)
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s: %(message)s",
    )

    if not args.html_file.is_file():
        log.error("file not found: %s", args.html_file)
        return 1

    secrets = load_secrets(args.env_file)
    for key in ("CONFLUENCE_URL", "CONFLUENCE_PERSONAL_TOKEN"):
        if key not in secrets:
            log.error("missing %s in %s", key, args.env_file)
            return 1

    base_url = secrets["CONFLUENCE_URL"].rstrip("/")
    token = secrets["CONFLUENCE_PERSONAL_TOKEN"]
    html = args.html_file.read_text(encoding="utf-8")

    try:
        push_page(args.page_id, html, base_url, token, args.comment)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        log.error("HTTP %d: %s", e.code, body[:500])
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
