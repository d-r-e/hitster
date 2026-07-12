#!/usr/bin/env python3
"""Resolve Spotify search URLs in a songs CSV into canonical track URLs.

Environment variables:
  SPOTIFY_CLIENT_ID
  SPOTIFY_CLIENT_SECRET

Usage:
  python resolve_spotify_urls.py songs_extended.csv songs_extended_resolved.csv
"""

from __future__ import annotations

import base64
import csv
import json
import os
import re
import sys
import time
import unicodedata
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

API_BASE = "https://api.spotify.com/v1"
TOKEN_URL = "https://accounts.spotify.com/api/token"
USER_AGENT = "hitster-song-url-resolver/1.0"


def normalize(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    value = value.casefold()
    value = re.sub(r"\b(feat|ft|featuring)\.?\b", " ", value)
    return re.sub(r"[^a-z0-9]+", "", value)


def request_json(request: Request, retries: int = 5) -> dict[str, Any]:
    for attempt in range(retries):
        try:
            with urlopen(request, timeout=30) as response:
                return json.load(response)
        except HTTPError as exc:
            if exc.code == 429:
                delay = int(exc.headers.get("Retry-After", "2"))
                time.sleep(max(delay, 1))
                continue
            if 500 <= exc.code < 600 and attempt + 1 < retries:
                time.sleep(2**attempt)
                continue
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Spotify HTTP {exc.code}: {detail}") from exc
        except URLError as exc:
            if attempt + 1 == retries:
                raise RuntimeError(f"Network error: {exc}") from exc
            time.sleep(2**attempt)
    raise RuntimeError("Spotify request failed after retries")


def get_token(client_id: str, client_secret: str) -> str:
    credentials = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    body = urlencode({"grant_type": "client_credentials"}).encode()
    request = Request(
        TOKEN_URL,
        data=body,
        headers={
            "Authorization": f"Basic {credentials}",
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": USER_AGENT,
        },
        method="POST",
    )
    payload = request_json(request)
    token = payload.get("access_token")
    if not token:
        raise RuntimeError("Spotify did not return an access token")
    return str(token)


def score_track(item: dict[str, Any], artist: str, title: str) -> tuple[int, int, int]:
    wanted_artist = normalize(artist)
    wanted_title = normalize(title)
    item_title = normalize(str(item.get("name", "")))
    item_artists = normalize(" ".join(a.get("name", "") for a in item.get("artists", [])))

    title_exact = int(item_title == wanted_title)
    artist_exact = int(wanted_artist in item_artists or item_artists in wanted_artist)
    title_overlap = len(set(re.findall(r"[a-z0-9]+", title.casefold())) & set(re.findall(r"[a-z0-9]+", str(item.get("name", "")).casefold())))
    popularity = int(item.get("popularity", 0))
    return title_exact * 100 + artist_exact * 50 + title_overlap * 5, popularity, -len(item_title)


def find_track(token: str, artist: str, title: str) -> str | None:
    queries = [
        f'track:"{title}" artist:"{artist}"',
        f"{artist} {title}",
    ]
    candidates: list[dict[str, Any]] = []
    for query in queries:
        params = urlencode({"q": query, "type": "track", "limit": 10, "market": "ES"})
        request = Request(
            f"{API_BASE}/search?{params}",
            headers={"Authorization": f"Bearer {token}", "User-Agent": USER_AGENT},
        )
        payload = request_json(request)
        candidates.extend(payload.get("tracks", {}).get("items", []))
        if candidates:
            break

    if not candidates:
        return None
    best = max(candidates, key=lambda item: score_track(item, artist, title))
    external = best.get("external_urls", {}).get("spotify")
    return str(external) if external else None


def main() -> int:
    input_path = Path(sys.argv[1] if len(sys.argv) > 1 else "songs_extended.csv")
    output_path = Path(sys.argv[2] if len(sys.argv) > 2 else "songs_extended_resolved.csv")
    client_id = os.environ.get("SPOTIFY_CLIENT_ID")
    client_secret = os.environ.get("SPOTIFY_CLIENT_SECRET")
    if not client_id or not client_secret:
        print("Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET first.", file=sys.stderr)
        return 2

    with input_path.open(encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    required = {"Artista", "Título", "Año", "URL"}
    if not rows or not required.issubset(rows[0]):
        print(f"Input must contain columns: {', '.join(sorted(required))}", file=sys.stderr)
        return 2

    token = get_token(client_id, client_secret)
    resolved = failed = preserved = 0
    for index, row in enumerate(rows, start=1):
        current = row.get("URL", "")
        if "/track/" in current:
            preserved += 1
            continue
        try:
            found = find_track(token, row["Artista"], row["Título"])
        except RuntimeError as exc:
            print(f"[{index}/{len(rows)}] error: {row['Artista']} – {row['Título']}: {exc}", file=sys.stderr)
            failed += 1
            continue
        if found:
            row["URL"] = found
            resolved += 1
            print(f"[{index}/{len(rows)}] {row['Artista']} – {row['Título']}")
        else:
            failed += 1
            print(f"[{index}/{len(rows)}] not found: {row['Artista']} – {row['Título']}", file=sys.stderr)
        time.sleep(0.08)

    with output_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)

    print(f"Saved {output_path}: {resolved} resolved, {preserved} preserved, {failed} unresolved.")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())