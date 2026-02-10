from __future__ import annotations

import datetime as dt
import json
import time
from pathlib import Path
from typing import Any, Iterable

import requests

from ..hashing import sha256_text


def _steam_app_details(app_id: int) -> dict[str, Any]:
    url = "https://store.steampowered.com/api/appdetails"
    resp = requests.get(url, params={"appids": str(app_id)}, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    entry = data.get(str(app_id)) or {}
    if not entry.get("success"):
        return {"name": f"app_{app_id}"}
    details = entry.get("data") or {}
    genres = [g.get("description") for g in (details.get("genres") or []) if isinstance(g, dict) and g.get("description")]
    categories = [c.get("description") for c in (details.get("categories") or []) if isinstance(c, dict) and c.get("description")]
    return {
        "name": details.get("name") or f"app_{app_id}",
        "type": details.get("type") or "game",
        "genres": genres,
        "categories": categories,
        "short_description": (details.get("short_description") or "")[:800],
    }


def _steam_reviews_page(
    *,
    app_id: int,
    cursor: str,
    language: str,
    review_type: str,
    review_filter: str,
    num_per_page: int = 100,
) -> dict[str, Any]:
    url = f"https://store.steampowered.com/appreviews/{app_id}"
    params = {
        "json": 1,
        "cursor": cursor,
        "language": language,
        "review_type": review_type,  # "positive" | "negative" | "all"
        "filter": review_filter,  # "recent" | "all"
        "purchase_type": "all",
        "num_per_page": num_per_page,
    }
    resp = requests.get(url, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def _extract_review_fields(review: dict[str, Any], *, app_id: int, max_review_chars: int) -> dict[str, Any]:
    author = review.get("author") or {}
    playtime_min = author.get("playtime_forever")
    playtime_hours = None
    try:
        if playtime_min is not None:
            playtime_hours = float(playtime_min) / 60.0
    except Exception:
        playtime_hours = None

    text = str(review.get("review") or "")
    if max_review_chars and len(text) > max_review_chars:
        text = text[:max_review_chars]

    return {
        "review_id": str(review.get("recommendationid") or ""),
        "app_id": int(app_id),
        "language": str(review.get("language") or "unknown"),
        "voted_up": bool(review.get("voted_up")),
        "playtime_hours": playtime_hours,
        "timestamp_created": int(review.get("timestamp_created") or 0),
        "review": text,
        "votes_up": int(review.get("votes_up") or 0),
        "votes_funny": int(review.get("votes_funny") or 0),
        "comment_count": int(review.get("comment_count") or 0),
    }


def build_steam_dataset(
    *,
    output_dir: Path,
    app_ids: list[int],
    languages: list[str],
    per_lang_pos: int,
    per_lang_neg: int,
    review_filter: str,
    seed: int,
    max_review_chars: int,
) -> dict[str, Any]:
    """Build a local Steam dataset snapshot.

    The output directory is meant to be gitignored (Steam review text may have redistribution constraints).
    """
    output_dir.mkdir(parents=True, exist_ok=True)

    games: dict[str, Any] = {}
    for app_id in app_ids:
        try:
            games[str(app_id)] = _steam_app_details(app_id)
        except Exception:
            games[str(app_id)] = {"name": f"app_{app_id}"}

    seen: set[str] = set()
    collected: list[dict[str, Any]] = []

    for app_id in app_ids:
        for language in languages:
            for review_type, need in [("positive", per_lang_pos), ("negative", per_lang_neg)]:
                cursor = "*"
                attempts = 0
                while need > 0 and attempts < 50:
                    attempts += 1
                    page = _steam_reviews_page(
                        app_id=app_id,
                        cursor=cursor,
                        language=language,
                        review_type=review_type,
                        review_filter=review_filter,
                    )
                    cursor = str(page.get("cursor") or "")
                    reviews = page.get("reviews") or []
                    if not reviews:
                        break
                    for r in reviews:
                        if need <= 0:
                            break
                        if not isinstance(r, dict):
                            continue
                        rid = str(r.get("recommendationid") or "")
                        if not rid or rid in seen:
                            continue
                        seen.add(rid)
                        collected.append(_extract_review_fields(r, app_id=app_id, max_review_chars=max_review_chars))
                        need -= 1
                    time.sleep(0.2)  # be gentle

    # Stable order for reproducibility
    collected.sort(key=lambda r: (int(r.get("app_id") or 0), str(r.get("language") or ""), bool(r.get("voted_up")), str(r.get("review_id") or "")))

    (output_dir / "games.json").write_text(json.dumps(games, indent=2, ensure_ascii=False), encoding="utf-8")
    with (output_dir / "reviews.jsonl").open("w", encoding="utf-8") as f:
        for r in collected:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    manifest = {
        "name": output_dir.name,
        "created_at": dt.datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "source": "steam",
        "app_ids": app_ids,
        "languages": languages,
        "params": {
            "per_lang_pos": per_lang_pos,
            "per_lang_neg": per_lang_neg,
            "filter": review_filter,
            "seed": seed,
            "max_review_chars": max_review_chars,
        },
        "counts": {
            "total_reviews": len(collected),
        },
    }

    # File hashes
    for fname in ["games.json", "reviews.jsonl"]:
        p = output_dir / fname
        manifest.setdefault("file_hashes", {})[fname] = sha256_text(p.read_text(encoding="utf-8"))
    (output_dir / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")

    return manifest

