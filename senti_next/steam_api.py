"""Utilities for interacting with Steam's public store API for reviews."""
from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Dict, Iterable, List, Optional

import requests

STORE_SEARCH_URL = "https://store.steampowered.com/api/storesearch"
APP_REVIEWS_URL = "https://store.steampowered.com/appreviews/{app_id}"


@dataclass
class AppSearchResult:
    appid: int
    name: str
    price: Optional[str]
    url: str


class SteamAPIError(RuntimeError):
    """Raised when the Steam API returns an unexpected response."""


_GAME_URL_RE = re.compile(r"/app/(\d+)")


def extract_app_id_from_input(value: str) -> Optional[int]:
    """Try to pull an app id from raw user input (numeric id or store URL)."""
    value = value.strip()
    if value.isdigit():
        return int(value)

    match = _GAME_URL_RE.search(value)
    if match:
        return int(match.group(1))

    return None


def search_applications(query: str, limit: int = 5) -> List[AppSearchResult]:
    """Search the Steam store for applications that match the query."""
    params = {
        "term": query,
        "l": "english",
        "cc": "US",
    }
    resp = requests.get(STORE_SEARCH_URL, params=params, timeout=15)
    if resp.status_code != 200:
        raise SteamAPIError(
            f"Store search failed with status code {resp.status_code}: {resp.text[:200]}"
        )

    payload = resp.json()
    items = payload.get("items", []) if isinstance(payload, dict) else []

    results: List[AppSearchResult] = []
    for row in items[:limit]:
        try:
            appid = int(row["id"])
        except (KeyError, ValueError, TypeError):
            continue
        results.append(
            AppSearchResult(
                appid=appid,
                name=row.get("name", "Unknown title"),
                price=row.get("final_formatted"),
                url=f"https://store.steampowered.com/app/{appid}",
            )
        )

    return results


REVIEW_METADATA_FIELDS: Dict[str, str] = {
    "recommendationid": "Unique review identifier",
    "language": "Language the review was written in",
    "review": "Full review text",
    "timestamp_created": "Unix timestamp when the review was created",
    "timestamp_updated": "Unix timestamp when the review was last updated",
    "voted_up": "Whether the reviewer marked the game as recommended",
    "votes_up": "Number of users who found this review helpful",
    "votes_funny": "Number of users who found this review funny",
    "weighted_vote_score": "Wilson score representation of helpful votes",
    "comment_count": "Number of comments on the review",
    "steam_purchase": "If the copy was purchased via Steam",
    "received_for_free": "If the reviewer received the game for free",
    "written_during_early_access": "Whether the review was written during early access",
}

AUTHOR_METADATA_FIELDS: Dict[str, str] = {
    "steamid": "Reviewer's SteamID",
    "num_games_owned": "Total number of games the reviewer owns",
    "num_reviews": "How many reviews the user has written",
    "playtime_forever": "Lifetime playtime in minutes",
    "playtime_last_two_weeks": "Last 2 weeks playtime in minutes",
    "playtime_at_review": "Playtime in minutes when the review was written",
    "last_played": "Unix timestamp of last play session",
}


def fetch_reviews(
    app_id: int,
    count: int = 100,
    language: str = "english",
    filter_type: str = "recent",
    day_range: Optional[int] = None,
) -> List[dict]:
    """Fetch up to ``count`` reviews for the given Steam application.

    Steam's review API returns results in pages using a cursor. This helper keeps
    requesting pages until enough reviews are gathered or the API stops
    providing additional data.
    """
    reviews: List[dict] = []
    cursor = "*"

    while len(reviews) < count:
        remaining = count - len(reviews)
        params = {
            "json": 1,
            "language": language,
            "purchase_type": "all",
            "review_type": "all",
            "num_per_page": min(100, remaining),
            "cursor": cursor,
            "filter": filter_type,
        }
        if day_range is not None:
            params["day_range"] = max(1, min(day_range, 365))
        resp = requests.get(APP_REVIEWS_URL.format(app_id=app_id), params=params, timeout=20)
        if resp.status_code != 200:
            raise SteamAPIError(
                f"Review fetch failed with status code {resp.status_code}: {resp.text[:200]}"
            )

        data = resp.json()
        batch = data.get("reviews", []) if isinstance(data, dict) else []
        if not batch:
            break

        reviews.extend(batch)
        cursor = data.get("cursor", cursor)
        if not data.get("success"):
            break

    return reviews[:count]


def resolve_app_id(user_input: str) -> Optional[int]:
    """Resolve the best app id for the given user input."""
    direct_app_id = extract_app_id_from_input(user_input)
    if direct_app_id is not None:
        return direct_app_id

    results = search_applications(user_input, limit=1)
    if not results:
        return None

    return results[0].appid


def iter_review_fields() -> Iterable[str]:
    """Return all review-level fields available from the API."""
    return REVIEW_METADATA_FIELDS.keys()


def iter_author_fields() -> Iterable[str]:
    """Return all author-level fields available from the API."""
    return AUTHOR_METADATA_FIELDS.keys()
