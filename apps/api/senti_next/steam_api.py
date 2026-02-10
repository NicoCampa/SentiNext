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
    "developer_response": "Text of developer response, if any",
    "timestamp_dev_responded": "Unix timestamp of developer response, if any",
    "primarily_steam_deck": "Whether reviewer primarily played on Steam Deck",
}

AUTHOR_METADATA_FIELDS: Dict[str, str] = {
    "steamid": "Reviewer's SteamID",
    "num_games_owned": "Total number of games the reviewer owns",
    "num_reviews": "How many reviews the user has written",
    "playtime_forever": "Lifetime playtime in minutes",
    "playtime_last_two_weeks": "Last 2 weeks playtime in minutes",
    "playtime_at_review": "Playtime in minutes when the review was written",
    "deck_playtime_at_review": "Steam Deck playtime when review was written",
    "last_played": "Unix timestamp of last play session",
}


def fetch_reviews(
    app_id: int,
    count: int = 100,
    language: str = "english",
    filter_type: str = "recent",
    day_range: Optional[int] = None,
    include_review_bombs: bool = False,
    progress_callback: Optional[callable] = None,
) -> List[dict]:
    """Fetch up to ``count`` reviews for the given Steam application.

    Steam's review API returns results in pages using a cursor. This helper keeps
    requesting pages until enough reviews are gathered or the API stops
    providing additional data.

    Args:
        app_id: Steam application ID
        count: Number of reviews to fetch. 0 means fetch all available reviews (no limit).
        language: Language code or "all" for all languages
        filter_type: "recent", "updated", or "all" (by helpfulness)
        day_range: For filter="all", range from now to n days ago (max 365)
        include_review_bombs: If True, includes reviews flagged as off-topic activity (review bombs).
                              Default False filters them out.
        progress_callback: Optional callback(fetched_count) called after each batch
    """
    unlimited = count == 0

    reviews: List[dict] = []
    cursor = "*"

    while unlimited or len(reviews) < count:
        remaining = 100 if unlimited else min(100, count - len(reviews))
        params = {
            "json": 1,
            "language": language,
            "purchase_type": "all",
            "review_type": "all",
            "num_per_page": remaining,
            "cursor": cursor,
            "filter": filter_type,
        }
        if day_range is not None:
            params["day_range"] = max(1, min(day_range, 365))
        if include_review_bombs:
            params["filter_offtopic_activity"] = 0
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

        # Report progress after each batch
        if progress_callback is not None:
            try:
                progress_callback(len(reviews))
            except Exception:
                pass  # Don't let progress callback errors stop fetching

        cursor = data.get("cursor", cursor)
        if not data.get("success"):
            break

    return reviews if unlimited else reviews[:count]


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

        # Extract price info
        is_free = details.get("is_free", False)
        price_overview = details.get("price_overview", {})
        if is_free:
            result["price_final"] = "Free"
            result["price_initial"] = None
            result["is_free"] = True
            result["price_discount"] = 0
            result["price_currency"] = None
        elif price_overview:
            # Convert cents to major currency units (e.g., $29.99)
            initial_cents = price_overview.get("initial", 0)
            final_cents = price_overview.get("final", 0)
            result["price_initial"] = float(initial_cents) / 100.0 if initial_cents else None
            result["price_final"] = float(final_cents) / 100.0 if final_cents else None
            result["price_initial_formatted"] = price_overview.get("initial_formatted", "")
            result["price_final_formatted"] = price_overview.get("final_formatted", "")
            result["price_discount"] = int(price_overview.get("discount_percent", 0))
            result["price_currency"] = price_overview.get("currency", "USD")
            result["is_free"] = False
        else:
            result["price_final"] = None
            result["price_initial"] = None
            result["is_free"] = False
            result["price_discount"] = 0
            result["price_currency"] = None

        # Extract release date
        release_date = details.get("release_date", {})
        result["release_date"] = release_date.get("date", None)
        result["coming_soon"] = release_date.get("coming_soon", False)

        # Extract developers and publishers
        result["developers"] = details.get("developers", [])
        result["publishers"] = details.get("publishers", [])

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
    include_review_bombs: bool = False,
    progress_callback: Optional[callable] = None,
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
        include_review_bombs: If True, includes reviews flagged as off-topic activity
        progress_callback: Optional callback(fetched_count) called to report total fetched

    Returns:
        List of review dicts, deduplicated and sorted by timestamp
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed
    import threading

    if not languages:
        # Default to "all" which Steam API interprets as all languages
        return fetch_reviews(app_id, count, "all", filter_type, day_range, include_review_bombs, progress_callback)

    if len(languages) == 1:
        return fetch_reviews(app_id, count, languages[0], filter_type, day_range, include_review_bombs, progress_callback)

    unlimited = count == 0

    # Distribute count across languages (0 = unlimited per language)
    if unlimited:
        per_language = 0
        first_language_count = 0
    else:
        per_language = max(1, count // len(languages))
        # First language gets any remainder
        first_language_count = count - (per_language * (len(languages) - 1))

    # Thread-safe counter for progress tracking across parallel fetches
    total_fetched = [0]  # Use list for mutability in nested function
    progress_lock = threading.Lock()

    def report_progress(batch_count: int) -> None:
        """Thread-safe progress reporter that aggregates counts from all languages."""
        if progress_callback is None:
            return
        with progress_lock:
            total_fetched[0] += batch_count
            try:
                progress_callback(total_fetched[0])
            except Exception:
                pass

    def fetch_single_language(lang: str, lang_count: int) -> Tuple[str, List[dict]]:
        """Fetch reviews for a single language."""
        last_reported = [0]

        def lang_progress(fetched: int) -> None:
            """Report incremental progress for this language."""
            increment = fetched - last_reported[0]
            if increment > 0:
                last_reported[0] = fetched
                report_progress(increment)

        try:
            reviews = fetch_reviews(app_id, lang_count, lang, filter_type, day_range, include_review_bombs, lang_progress)
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
    return all_reviews if unlimited else all_reviews[:count]


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


# ============================================================================
# Steam Web API Endpoints (News, Players, Achievements)
# ============================================================================

STEAM_NEWS_URL = "https://api.steampowered.com/ISteamNews/GetNewsForApp/v2"
STEAM_PLAYER_COUNT_URL = "https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1"
STEAM_ACHIEVEMENTS_URL = "https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2"
STEAM_ACHIEVEMENT_SCHEMA_URL = "https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2"


@dataclass
class NewsItem:
    """Represents a Steam news/announcement item."""
    gid: str  # Unique news item ID
    title: str
    url: str
    author: str
    contents: str  # Can be HTML or BBCode
    feed_label: str  # e.g., "Community Announcements", "Patch Notes"
    date: int  # Unix timestamp
    feed_name: str
    feed_type: int  # 0 = unknown, 1 = Steam announcements, 2 = Steam news


def fetch_news_for_app(
    app_id: int,
    count: int = 20,
    max_length: int = 500,
) -> List[NewsItem]:
    """Fetch news/announcements for a Steam application.

    Uses ISteamNews/GetNewsForApp endpoint to retrieve patch notes,
    announcements, and updates.

    Args:
        app_id: Steam application ID
        count: Maximum number of news items to return (default 20)
        max_length: Maximum length of contents field (0 for full content)

    Returns:
        List of NewsItem objects sorted by date (newest first)
    """
    params = {
        "appid": app_id,
        "count": count,
        "maxlength": max_length,
        "format": "json",
    }

    try:
        resp = _protected_get(STEAM_NEWS_URL, params=params, timeout=15)
        data = resp.json()

        app_news = data.get("appnews", {})
        news_items = app_news.get("newsitems", [])

        results: List[NewsItem] = []
        for item in news_items:
            try:
                results.append(
                    NewsItem(
                        gid=str(item.get("gid", "")),
                        title=item.get("title", ""),
                        url=item.get("url", ""),
                        author=item.get("author", ""),
                        contents=item.get("contents", ""),
                        feed_label=item.get("feedlabel", ""),
                        date=item.get("date", 0),
                        feed_name=item.get("feedname", ""),
                        feed_type=item.get("feed_type", 0),
                    )
                )
            except Exception as e:
                logger.warning(f"Failed to parse news item: {e}")
                continue

        return results

    except SteamAPIError:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch news for app {app_id}: {e}")
        return []


def fetch_current_players(app_id: int) -> Optional[int]:
    """Fetch the current number of players for a Steam application.

    Uses ISteamUserStats/GetNumberOfCurrentPlayers endpoint.

    Args:
        app_id: Steam application ID

    Returns:
        Current player count, or None if unavailable
    """
    params = {
        "appid": app_id,
        "format": "json",
    }

    try:
        resp = _protected_get(STEAM_PLAYER_COUNT_URL, params=params, timeout=10)
        data = resp.json()

        response = data.get("response", {})
        if response.get("result") == 1:
            return response.get("player_count")
        return None

    except SteamAPIError:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch player count for app {app_id}: {e}")
        return None


@dataclass
class AchievementStat:
    """Global achievement percentage data."""
    name: str  # Internal achievement name/API name
    percent: float  # Percentage of players who earned this (0-100)


@dataclass
class AchievementInfo:
    """Full achievement info including display name and icon."""
    name: str  # Internal API name
    display_name: str  # Localized display name
    description: str  # Achievement description
    icon: str  # URL to unlocked icon
    icon_gray: str  # URL to locked icon
    hidden: bool  # Whether achievement is hidden until unlocked


def fetch_global_achievements(app_id: int) -> List[AchievementStat]:
    """Fetch global achievement percentages for a Steam application.

    Uses ISteamUserStats/GetGlobalAchievementPercentagesForApp endpoint.

    Args:
        app_id: Steam application ID

    Returns:
        List of AchievementStat objects sorted by percentage (highest first)
    """
    params = {
        "gameid": app_id,
        "format": "json",
    }

    try:
        resp = _protected_get(STEAM_ACHIEVEMENTS_URL, params=params, timeout=15)
        data = resp.json()

        achievement_percentages = data.get("achievementpercentages", {})
        achievements = achievement_percentages.get("achievements", [])

        results: List[AchievementStat] = []
        for ach in achievements:
            try:
                results.append(
                    AchievementStat(
                        name=ach.get("name", ""),
                        percent=float(ach.get("percent", 0)),
                    )
                )
            except (ValueError, TypeError) as e:
                logger.warning(f"Failed to parse achievement stat: {e}")
                continue

        # Sort by percentage descending (most common achievements first)
        results.sort(key=lambda x: x.percent, reverse=True)
        return results

    except SteamAPIError:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch achievements for app {app_id}: {e}")
        return []


def fetch_achievement_schema(app_id: int) -> List[AchievementInfo]:
    """Fetch achievement schema (names, descriptions, icons) for a Steam application.

    Uses ISteamUserStats/GetSchemaForGame endpoint.
    Note: Some games may not expose their schema publicly.

    Args:
        app_id: Steam application ID

    Returns:
        List of AchievementInfo objects
    """
    params = {
        "appid": app_id,
        "format": "json",
    }

    try:
        resp = _protected_get(STEAM_ACHIEVEMENT_SCHEMA_URL, params=params, timeout=15)
        data = resp.json()

        game = data.get("game", {})
        available_stats = game.get("availableGameStats", {})
        achievements = available_stats.get("achievements", [])

        results: List[AchievementInfo] = []
        for ach in achievements:
            try:
                results.append(
                    AchievementInfo(
                        name=ach.get("name", ""),
                        display_name=ach.get("displayName", ach.get("name", "")),
                        description=ach.get("description", ""),
                        icon=ach.get("icon", ""),
                        icon_gray=ach.get("icongray", ""),
                        hidden=bool(ach.get("hidden", 0)),
                    )
                )
            except Exception as e:
                logger.warning(f"Failed to parse achievement schema: {e}")
                continue

        return results

    except SteamAPIError:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch achievement schema for app {app_id}: {e}")
        return []


def fetch_achievements_with_stats(app_id: int) -> List[Dict]:
    """Fetch achievements with both percentages and display info combined.

    Merges data from GetGlobalAchievementPercentagesForApp and GetSchemaForGame.

    Args:
        app_id: Steam application ID

    Returns:
        List of dicts with combined achievement data:
        {name, display_name, description, percent, icon, icon_gray, hidden}
    """
    # Fetch both in parallel for efficiency
    from concurrent.futures import ThreadPoolExecutor

    with ThreadPoolExecutor(max_workers=2) as executor:
        stats_future = executor.submit(fetch_global_achievements, app_id)
        schema_future = executor.submit(fetch_achievement_schema, app_id)

        stats = stats_future.result()
        schema = schema_future.result()

    # Create lookup by name
    schema_map = {ach.name: ach for ach in schema}

    # Merge data
    results: List[Dict] = []
    for stat in stats:
        info = schema_map.get(stat.name)
        result = {
            "name": stat.name,
            "percent": stat.percent,
            "display_name": info.display_name if info else stat.name,
            "description": info.description if info else "",
            "icon": info.icon if info else "",
            "icon_gray": info.icon_gray if info else "",
            "hidden": info.hidden if info else False,
        }
        results.append(result)

    return results
