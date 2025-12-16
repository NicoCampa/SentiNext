"""Multi-source feedback ingestion and normalization helpers."""
from __future__ import annotations

import hashlib
import logging
import os
import re
from datetime import datetime, timezone
from difflib import SequenceMatcher
from typing import Dict, Iterable, List, Optional
from urllib.parse import quote_plus

import requests

logger = logging.getLogger(__name__)

SOURCE_STEAM_REVIEW = "steam_review"
SOURCE_REDDIT = "reddit"
SOURCE_DISCORD = "discord"
SOURCE_STEAM_FORUM = "steam_forum"


def _to_iso(ts: Optional[float]) -> Optional[str]:
    if ts is None:
        return None
    try:
        return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
    except Exception:
        return None


def normalize_feedback_item(
    *,
    feedback_id: str,
    app_id: int,
    source: str,
    text: str,
    created_at: Optional[str],
    author: Optional[str] = None,
    language: Optional[str] = None,
    engagement: Optional[dict] = None,
    url: Optional[str] = None,
    context: Optional[dict] = None,
) -> dict:
    return {
        "feedback_id": feedback_id,
        "app_id": int(app_id),
        "source": source,
        "text": text or "",
        "created_at": created_at,
        "author": author,
        "language": language,
        "engagement": engagement or {},
        "url": url,
        "context": context or {},
    }


def normalize_steam_reviews(app_id: int, reviews: Iterable[dict]) -> List[dict]:
    items: List[dict] = []
    for review in reviews:
        rid = review.get("recommendationid") or review.get("review_id")
        text = review.get("review") or ""
        created_at = review.get("timestamp_created")
        author = (review.get("author") or {}).get("steamid")
        items.append(
            normalize_feedback_item(
                feedback_id=f"{SOURCE_STEAM_REVIEW}:{rid}",
                app_id=app_id,
                source=SOURCE_STEAM_REVIEW,
                text=text,
                created_at=_to_iso(created_at),
                author=author,
                language=review.get("language"),
                engagement={
                    "votes_up": review.get("votes_up"),
                    "votes_funny": review.get("votes_funny"),
                },
                url=None,
                context={
                    "voted_up": review.get("voted_up"),
                    "steam_purchase": review.get("steam_purchase"),
                    "received_for_free": review.get("received_for_free"),
                },
            )
        )
    return items


def dedupe_feedback(items: List[dict], similarity_threshold: float = 0.92) -> List[dict]:
    """Remove exact and near-duplicate feedback items by text similarity."""
    seen_hashes: Dict[str, str] = {}
    deduped: List[dict] = []
    for item in items:
        text = (item.get("text") or "").strip()
        normalized = re.sub(r"\s+", " ", text.lower())
        text_hash = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
        if text_hash in seen_hashes:
            continue

        # Near-duplicate check against recent deduped items
        is_duplicate = False
        for existing in deduped[-50:]:
            existing_text = (existing.get("text") or "").strip().lower()
            if not existing_text:
                continue
            ratio = SequenceMatcher(None, normalized, existing_text).ratio()
            if ratio >= similarity_threshold:
                is_duplicate = True
                break

        if is_duplicate:
            continue

        seen_hashes[text_hash] = item["feedback_id"]
        deduped.append(item)

    return deduped


def fetch_reddit_feedback(app_id: int, app_name: str, limit: int = 50) -> List[dict]:
    """Fetch recent Reddit posts mentioning the game."""
    if limit <= 0:
        return []

    query = quote_plus(f"{app_name} OR appid {app_id}")
    url = f"https://www.reddit.com/search.json?q={query}&sort=new&limit={min(limit, 100)}"
    headers = {"User-Agent": os.getenv("SENTINEXT_REDDIT_UA", "SentiNext/0.1")}

    try:
        resp = requests.get(url, headers=headers, timeout=10)
        if resp.status_code != 200:
            logger.warning("Reddit search failed (%s): %s", resp.status_code, resp.text[:200])
            return []
        payload = resp.json()
        children = payload.get("data", {}).get("children", [])
    except Exception as exc:
        logger.warning("Reddit fetch failed: %s", exc)
        return []

    results: List[dict] = []
    for child in children:
        data = child.get("data") or {}
        post_id = data.get("id")
        title = data.get("title") or ""
        body = data.get("selftext") or ""
        text = f"{title}\n\n{body}".strip()
        created_at = data.get("created_utc")
        url = f"https://www.reddit.com{data.get('permalink')}" if data.get("permalink") else None
        results.append(
            normalize_feedback_item(
                feedback_id=f"{SOURCE_REDDIT}:{post_id}",
                app_id=app_id,
                source=SOURCE_REDDIT,
                text=text,
                created_at=_to_iso(created_at),
                author=data.get("author"),
                language="en",
                engagement={"score": data.get("score"), "num_comments": data.get("num_comments")},
                url=url,
                context={"subreddit": data.get("subreddit")},
            )
        )
    return results


def fetch_discord_feedback(app_id: int, app_name: str, limit_per_channel: int = 50) -> List[dict]:
    """Fetch recent Discord messages from configured channels that mention the game."""
    token = os.getenv("SENTINEXT_DISCORD_TOKEN")
    channel_ids = os.getenv("SENTINEXT_DISCORD_CHANNEL_IDS", "")
    if not token or not channel_ids:
        return []

    headers = {"Authorization": f"Bot {token}"}
    results: List[dict] = []
    for channel_id in [c.strip() for c in channel_ids.split(",") if c.strip()]:
        url = f"https://discord.com/api/v10/channels/{channel_id}/messages?limit={min(limit_per_channel, 100)}"
        try:
            resp = requests.get(url, headers=headers, timeout=10)
            if resp.status_code != 200:
                logger.warning("Discord fetch failed for channel %s (%s): %s", channel_id, resp.status_code, resp.text[:200])
                continue
            messages = resp.json()
        except Exception as exc:
            logger.warning("Discord fetch error for channel %s: %s", channel_id, exc)
            continue

        for msg in messages:
            content = msg.get("content") or ""
            # Basic relevance filter
            if str(app_id) not in content and app_name.lower() not in content.lower():
                continue

            created_at_iso = msg.get("timestamp")
            author = (msg.get("author") or {}).get("username")
            results.append(
                normalize_feedback_item(
                    feedback_id=f"{SOURCE_DISCORD}:{msg.get('id')}",
                    app_id=app_id,
                    source=SOURCE_DISCORD,
                    text=content,
                    created_at=created_at_iso,
                    author=author,
                    language=None,
                    engagement={"reactions": len(msg.get("reactions") or [])},
                    url=None,
                    context={"channel_id": channel_id},
                )
            )
    return results


def fetch_steam_forum_feedback(app_id: int, limit: int = 30) -> List[dict]:
    """Fetch recent Steam forum thread titles (best-effort HTML scrape)."""
    url = f"https://steamcommunity.com/app/{app_id}/discussions/"
    try:
        resp = requests.get(url, timeout=10)
        if resp.status_code != 200:
            logger.warning("Steam forum fetch failed (%s): %s", resp.status_code, resp.text[:200])
            return []
        html = resp.text
    except Exception as exc:
        logger.warning("Steam forum fetch error: %s", exc)
        return []

    threads: List[dict] = []
    # Very lightweight parse of thread links
    matches = re.findall(r'<a[^>]+class="forum_topic_link"[^>]*href="([^"]+)"[^>]*>([^<]+)</a>', html, flags=re.IGNORECASE)
    for href, title in matches[:limit]:
        threads.append(
            normalize_feedback_item(
                feedback_id=f"{SOURCE_STEAM_FORUM}:{hashlib.md5(href.encode('utf-8')).hexdigest()}",  # noqa: S324 - not for security
                app_id=app_id,
                source=SOURCE_STEAM_FORUM,
                text=title.strip(),
                created_at=None,
                author=None,
                language=None,
                engagement={},
                url=href,
                context={},
            )
        )
    return threads


def collect_feedback(
    app_id: int,
    app_name: str,
    steam_reviews: Iterable[dict],
    *,
    include_reddit: bool = True,
    include_discord: bool = True,
    include_steam_forums: bool = True,
    reddit_limit: int = 50,
    discord_limit: int = 50,
    forum_limit: int = 30,
) -> List[dict]:
    """Aggregate normalized feedback across sources, with deduplication."""
    combined: List[dict] = []
    combined.extend(normalize_steam_reviews(app_id, steam_reviews))

    if include_reddit:
        combined.extend(fetch_reddit_feedback(app_id, app_name, limit=reddit_limit))
    if include_discord:
        combined.extend(fetch_discord_feedback(app_id, app_name, limit_per_channel=discord_limit))
    if include_steam_forums:
        combined.extend(fetch_steam_forum_feedback(app_id, limit=forum_limit))

    return dedupe_feedback(combined)


__all__ = [
    "SOURCE_DISCORD",
    "SOURCE_REDDIT",
    "SOURCE_STEAM_FORUM",
    "SOURCE_STEAM_REVIEW",
    "collect_feedback",
    "dedupe_feedback",
    "fetch_discord_feedback",
    "fetch_reddit_feedback",
    "fetch_steam_forum_feedback",
    "normalize_feedback_item",
    "normalize_steam_reviews",
]
