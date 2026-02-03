"""Utilities for interacting with Steam's public store API for reviews."""
from __future__ import annotations

from dataclasses import dataclass
import logging
import re
import threading
import time
from typing import Dict, Iterable, List, Optional, Tuple

import requests

from .circuit_breaker import steam_api_breaker, CircuitOpenError

logger = logging.getLogger(__name__)


# In-memory cache for game context with TTL
_CONTEXT_CACHE: Dict[int, Tuple[Dict, float]] = {}
_CONTEXT_CACHE_LOCK = threading.Lock()
_CONTEXT_CACHE_TTL_SECONDS = 3600  # 1 hour

STORE_SEARCH_URL = "https://store.steampowered.com/api/storesearch"
APP_REVIEWS_URL = "https://store.steampowered.com/appreviews/{app_id}"
APP_DETAILS_URL = "https://store.steampowered.com/api/appdetails"


@dataclass
class AppSearchResult:
    appid: int
    name: str
    price: Optional[str]
    url: str
    image_url: Optional[str] = None


class SteamAPIError(RuntimeError):
    """Raised when the Steam API returns an unexpected response."""


_GAME_URL_RE = re.compile(r"/app/(\d+)")
_DEFAULT_HEADERS = {
    "User-Agent": "SentiNext/0.1 (+https://sentinext.local)",
}
_RETRY_STATUS_CODES = {429, 500, 502, 503, 504}


def _get_with_retries(
    url: str,
    *,
    params: Optional[Dict] = None,
    timeout: int = 15,
    retries: int = 3,
    backoff: float = 0.6,
) -> requests.Response:
    last_error: Optional[Exception] = None
    for attempt in range(1, retries + 1):
        try:
            response = requests.get(
                url,
                params=params,
                timeout=timeout,
                headers=_DEFAULT_HEADERS,
            )
        except requests.RequestException as exc:
            last_error = exc
            if attempt == retries:
                raise SteamAPIError(f"Request to {url} failed: {exc}") from exc
        else:
            if response.status_code == 200:
                return response
            if response.status_code not in _RETRY_STATUS_CODES or attempt == retries:
                truncated = response.text[:200] if response.text else ""
                raise SteamAPIError(
                    f"Request to {url} failed with status code {response.status_code}: {truncated}"
                )
        time.sleep(backoff * attempt)

    raise SteamAPIError(f"Request to {url} failed after {retries} attempts: {last_error}")


def _protected_get(
    url: str,
    *,
    params: Optional[Dict] = None,
    timeout: int = 15,
    retries: int = 3,
    backoff: float = 0.6,
) -> requests.Response:
    """Execute GET request with circuit breaker protection.

    Wraps _get_with_retries with the Steam API circuit breaker to prevent
    cascading failures when the Steam API is unavailable.
    """
    try:
        return steam_api_breaker.call(
            _get_with_retries,
            url,
            params=params,
            timeout=timeout,
            retries=retries,
            backoff=backoff,
        )
    except CircuitOpenError as exc:
        logger.warning("Steam API circuit open: %s", exc)
        raise SteamAPIError(
            f"Steam API temporarily unavailable (circuit open). Retry after {exc.retry_after:.1f}s"
        ) from exc


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
    resp = _protected_get(STORE_SEARCH_URL, params=params, timeout=15)

    payload = resp.json()
    items = payload.get("items", []) if isinstance(payload, dict) else []

    results: List[AppSearchResult] = []
    for row in items[:limit]:
        try:
            appid = int(row["id"])
        except (KeyError, ValueError, TypeError):
            continue
        image_url = None
        if isinstance(row, dict):
            image_url = row.get("tiny_image") or row.get("header_image") or row.get("capsule_image")
        results.append(
            AppSearchResult(
                appid=appid,
                name=row.get("name", "Unknown title"),
                price=row.get("final_formatted"),
                url=f"https://store.steampowered.com/app/{appid}",
                image_url=image_url,
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
        resp = _protected_get(
            APP_REVIEWS_URL.format(app_id=app_id),
            params=params,
            timeout=20,
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


def _fetch_app_details_uncached(app_id: int) -> Optional[Dict]:
    """Fetch game details from Steam's appdetails API (no caching)."""
    params = {"appids": app_id}
    try:
        resp = _protected_get(APP_DETAILS_URL, params=params, timeout=15)

        data = resp.json()
        if not data or str(app_id) not in data:
            return None

        app_data = data[str(app_id)]
        if not app_data.get("success"):
            return None

        details = app_data.get("data", {})
        if not details:
            return None

        # Extract relevant fields
        result = {
            "name": details.get("name", ""),
            "short_description": details.get("short_description", ""),
            "type": details.get("type", "game"),
            "header_image": details.get("header_image", ""),
        }

        # Extract genres
        genres = details.get("genres", [])
        result["genres"] = [g.get("description", "") for g in genres if isinstance(g, dict)]

        # Extract categories (single-player, multiplayer, etc.)
        categories = details.get("categories", [])
        result["categories"] = [c.get("description", "") for c in categories if isinstance(c, dict)]

        return result

    except Exception:
        return None


def fetch_app_details(app_id: int, use_cache: bool = True) -> Optional[Dict]:
    """Fetch game details from Steam's appdetails API.

    Returns a dict with: name, short_description, genres, categories, tags (if available).
    Returns None if the request fails or app is not found.

    Results are cached in-memory for 1 hour to reduce API calls.
    """
    if use_cache:
        with _CONTEXT_CACHE_LOCK:
            if app_id in _CONTEXT_CACHE:
                cached_result, cached_time = _CONTEXT_CACHE[app_id]
                if time.time() - cached_time < _CONTEXT_CACHE_TTL_SECONDS:
                    return cached_result
                # Cache expired, remove it
                del _CONTEXT_CACHE[app_id]

    result = _fetch_app_details_uncached(app_id)

    if result is not None and use_cache:
        with _CONTEXT_CACHE_LOCK:
            _CONTEXT_CACHE[app_id] = (result, time.time())

    return result


def clear_app_details_cache(app_id: Optional[int] = None) -> None:
    """Clear the app details cache. If app_id is provided, only clear that entry."""
    with _CONTEXT_CACHE_LOCK:
        if app_id is not None:
            _CONTEXT_CACHE.pop(app_id, None)
        else:
            _CONTEXT_CACHE.clear()


def fetch_reviews_multi_language(
    app_id: int,
    count: int = 100,
    languages: Optional[List[str]] = None,
    filter_type: str = "recent",
    day_range: Optional[int] = None,
) -> List[dict]:
    """Fetch reviews across multiple languages in parallel.

    Distributes the count evenly across languages, then fetches from each
    concurrently for faster performance.
    Reviews are deduplicated by recommendationid and sorted by timestamp.

    Args:
        app_id: Steam application ID
        count: Total number of reviews to fetch across all languages
        languages: List of language codes (e.g., ["english", "german", "french"])
                   If None or empty, defaults to ["all"] which fetches all languages
        filter_type: "recent" or "all"
        day_range: Optional day range filter

    Returns:
        List of review dicts, deduplicated and sorted by timestamp
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed

    if not languages:
        # Default to "all" which Steam API interprets as all languages
        return fetch_reviews(app_id, count, "all", filter_type, day_range)

    if len(languages) == 1:
        return fetch_reviews(app_id, count, languages[0], filter_type, day_range)

    # Distribute count across languages
    per_language = max(1, count // len(languages))
    # First language gets any remainder
    first_language_count = count - (per_language * (len(languages) - 1))

    def fetch_single_language(lang: str, lang_count: int) -> Tuple[str, List[dict]]:
        """Fetch reviews for a single language."""
        try:
            reviews = fetch_reviews(app_id, lang_count, lang, filter_type, day_range)
            return (lang, reviews)
        except SteamAPIError as e:
            logger.warning(f"Failed to fetch {lang} reviews for app {app_id}: {e}")
            return (lang, [])

    all_reviews: List[dict] = []
    seen_ids: set = set()

    # Fetch all languages in parallel (limit to 4 concurrent to avoid rate limiting)
    max_workers = min(4, len(languages))
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = []
        for i, lang in enumerate(languages):
            lang_count = first_language_count if i == 0 else per_language
            futures.append(executor.submit(fetch_single_language, lang, lang_count))

        for future in as_completed(futures):
            lang, reviews = future.result()
            for review in reviews:
                review_id = review.get("recommendationid")
                if review_id and review_id not in seen_ids:
                    seen_ids.add(review_id)
                    all_reviews.append(review)

    # Sort by timestamp (most recent first) and limit to requested count
    all_reviews.sort(key=lambda r: r.get("timestamp_created", 0), reverse=True)
    return all_reviews[:count]


# Steam language codes mapping (display name -> API code)
STEAM_LANGUAGES = {
    "english": "english",
    "german": "german",
    "french": "french",
    "spanish": "spanish",
    "italian": "italian",
    "polish": "polish",
    "portuguese": "portuguese",
    "brazilian": "brazilian",
    "russian": "russian",
    "turkish": "turkish",
    "japanese": "japanese",
    "koreana": "koreana",
    "schinese": "schinese",
    "tchinese": "tchinese",
    "thai": "thai",
    "czech": "czech",
    "danish": "danish",
    "dutch": "dutch",
    "finnish": "finnish",
    "greek": "greek",
    "hungarian": "hungarian",
    "norwegian": "norwegian",
    "romanian": "romanian",
    "swedish": "swedish",
    "ukrainian": "ukrainian",
    "vietnamese": "vietnamese",
    "arabic": "arabic",
    "indonesian": "indonesian",
}


def iter_review_fields() -> Iterable[str]:
    """Return all review-level fields available from the API."""
    return REVIEW_METADATA_FIELDS.keys()


def iter_author_fields() -> Iterable[str]:
    """Return all author-level fields available from the API."""
    return AUTHOR_METADATA_FIELDS.keys()
