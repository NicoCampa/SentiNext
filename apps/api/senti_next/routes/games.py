"""Game search, starred games, and Steam data endpoints."""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, Field

from .. import storage
from ..steam_api import (
    fetch_app_details,
    fetch_news_for_app,
    fetch_current_players,
    fetch_achievements_with_stats,
    SteamAPIError,
)
from .. import search_applications, STEAM_LANGUAGES
from ._shared import (
    AnalyzeMetadata,
    StarredGamePayload,
    StarredGameResponse,
    NewsItemResponse,
    SAMPLE_LIMIT,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class SearchResult(BaseModel):
    appid: int
    name: str
    price: Optional[str] = None
    url: str
    image_url: Optional[str] = None


class FavoriteStatusPayload(BaseModel):
    is_favorite: bool


class PlayerCountResponse(BaseModel):
    app_id: int
    player_count: Optional[int]
    timestamp: int


class PriceResponse(BaseModel):
    app_id: int
    is_free: bool
    price_initial: Optional[float] = None
    price_final: Optional[float] = None
    price_initial_formatted: Optional[str] = None
    price_final_formatted: Optional[str] = None
    price_discount: int = 0
    price_currency: Optional[str] = None
    timestamp: int


class GameDetailsResponse(BaseModel):
    app_id: int
    name: str
    release_date: Optional[str] = None
    coming_soon: bool = False
    developers: List[str] = []
    publishers: List[str] = []
    genres: List[str] = []
    categories: List[str] = []
    is_free: bool = False
    price_initial: Optional[float] = None
    price_final: Optional[float] = None
    price_discount: int = 0
    price_currency: Optional[str] = None
    timestamp: int


class AchievementResponse(BaseModel):
    name: str
    display_name: str
    description: str
    percent: float
    icon: str
    icon_gray: str
    hidden: bool


class AchievementsResponse(BaseModel):
    app_id: int
    achievements: List[AchievementResponse]
    total_count: int
    completion_rate: Optional[float]


class NewsResponse(BaseModel):
    app_id: int
    news_items: List[NewsItemResponse]


class GameContextResponse(BaseModel):
    app_id: int
    name: Optional[str]
    short_description: Optional[str]
    genres: List[str]
    categories: List[str]
    header_image: Optional[str]
    current_players: Optional[int]
    recent_news: List[NewsItemResponse]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/search", response_model=List[SearchResult])
def search(query: str) -> List[SearchResult]:
    if not query or len(query.strip()) < 2:
        raise HTTPException(status_code=400, detail="Query must be at least 2 characters long.")
    try:
        results = search_applications(query.strip(), limit=5)
    except SteamAPIError as exc:
        logger.error("Steam API error during search: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Unexpected error during search")
        raise HTTPException(status_code=500, detail="Internal server error") from exc

    return [
        SearchResult(appid=item.appid, name=item.name, price=item.price, url=item.url, image_url=item.image_url)
        for item in results
    ]


@router.get("/languages")
def get_available_languages() -> dict:
    return {
        "languages": list(STEAM_LANGUAGES.keys()),
        "default": "all",
        "popular": ["english", "german", "french", "spanish", "russian", "schinese", "japanese", "portuguese", "brazilian"],
    }


# ---------------------------------------------------------------------------
# Starred games
# ---------------------------------------------------------------------------

@router.get("/starred", response_model=List[StarredGameResponse])
def list_starred_games() -> List[StarredGameResponse]:

    entries = storage.load_starred_games()
    response: List[StarredGameResponse] = []
    for item in entries:
        metadata_payload = item.get("metadata") or {}
        if metadata_payload and not metadata_payload.get("header_image"):
            details = fetch_app_details(item["app_id"])
            if details and details.get("header_image"):
                metadata_payload["header_image"] = details["header_image"]
        metadata = AnalyzeMetadata(**metadata_payload)
        updated_at = datetime.fromtimestamp(item["updated_at"], tz=timezone.utc).isoformat().replace("+00:00", "Z")
        response.append(
            StarredGameResponse(
                app_id=item["app_id"],
                name=item["name"],
                metadata=metadata,
                insights=item.get("insights"),
                sample=item.get("sample", []),
                updated_at=updated_at,
                is_favorite=item.get("is_favorite", False),
            )
        )
    return response


@router.post("/starred", status_code=204)
def save_starred_game(payload: StarredGamePayload) -> Response:

    sample = payload.sample[:SAMPLE_LIMIT]

    game_details = fetch_app_details(payload.app_id)
    genres = game_details.get("genres", []) if game_details else []
    categories = game_details.get("categories", []) if game_details else []
    metadata_payload = payload.metadata.dict()
    if game_details and game_details.get("header_image"):
        metadata_payload["header_image"] = game_details["header_image"]

    storage.save_starred_game(
        app_id=payload.app_id,
        name=payload.name,
        metadata=metadata_payload,
        insights=payload.insights,
        sample=sample,
        genres=genres,
        categories=categories,
    )
    return Response(status_code=204)


@router.delete("/starred/{app_id}", status_code=204)
def remove_starred_game(app_id: int) -> Response:

    storage.delete_starred_game(app_id)
    return Response(status_code=204)


@router.patch("/starred/{app_id}/favorite", status_code=200)
def toggle_favorite_status(app_id: int, payload: FavoriteStatusPayload) -> dict:

    updated = storage.update_favorite_status(app_id, payload.is_favorite)
    if not updated:
        raise HTTPException(status_code=404, detail="Starred game not found")
    return {"app_id": app_id, "is_favorite": payload.is_favorite}


@router.get("/starred/favorites", response_model=List[StarredGameResponse])
def list_favorite_games() -> List[StarredGameResponse]:

    entries = storage.load_favorite_games()
    response: List[StarredGameResponse] = []
    for item in entries:
        metadata_payload = item.get("metadata") or {}
        if metadata_payload and not metadata_payload.get("header_image"):
            details = fetch_app_details(item["app_id"])
            if details and details.get("header_image"):
                metadata_payload["header_image"] = details["header_image"]
        metadata = AnalyzeMetadata(**metadata_payload)
        updated_at = datetime.fromtimestamp(item["updated_at"], tz=timezone.utc).isoformat().replace("+00:00", "Z")
        response.append(
            StarredGameResponse(
                app_id=item["app_id"],
                name=item["name"],
                metadata=metadata,
                insights=item.get("insights"),
                sample=item.get("sample", []),
                updated_at=updated_at,
                is_favorite=True,
            )
        )
    return response


@router.delete("/games/{app_id}", status_code=204)
def delete_game_data(app_id: int) -> Response:
    storage.delete_all_game_data(app_id)
    return Response(status_code=204)


# ---------------------------------------------------------------------------
# Steam extended data endpoints
# ---------------------------------------------------------------------------

@router.get("/steam/news/{app_id}", response_model=NewsResponse)
def get_steam_news(app_id: int, count: int = 20, max_length: int = 500):
    try:
        news_items = fetch_news_for_app(app_id, count=count, max_length=max_length)
        return NewsResponse(
            app_id=app_id,
            news_items=[
                NewsItemResponse(
                    gid=item.gid,
                    title=item.title,
                    url=item.url,
                    author=item.author,
                    contents=item.contents,
                    feed_label=item.feed_label,
                    date=item.date,
                    feed_name=item.feed_name,
                    feed_type=item.feed_type,
                )
                for item in news_items
            ],
        )
    except SteamAPIError as exc:
        logger.error("Steam API error fetching news for app %s: %s", app_id, exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Unexpected error fetching news for app %s", app_id)
        raise HTTPException(status_code=500, detail="Internal server error") from exc


@router.get("/steam/players/{app_id}", response_model=PlayerCountResponse)
def get_steam_player_count(app_id: int):
    try:
        player_count = fetch_current_players(app_id)
        return PlayerCountResponse(
            app_id=app_id,
            player_count=player_count,
            timestamp=int(datetime.now(timezone.utc).timestamp()),
        )
    except SteamAPIError as exc:
        logger.error("Steam API error fetching player count for app %s: %s", app_id, exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Unexpected error fetching player count for app %s", app_id)
        raise HTTPException(status_code=500, detail="Internal server error") from exc


@router.get("/steam/price/{app_id}", response_model=PriceResponse)
def get_steam_price(app_id: int, cc: str = "us"):
    try:
        details = fetch_app_details(app_id, use_cache=False)
        if not details:
            raise HTTPException(status_code=404, detail="Game not found")

        is_free = details.get("is_free", False)

        return PriceResponse(
            app_id=app_id,
            is_free=is_free,
            price_initial=details.get("price_initial"),
            price_final=details.get("price_final") if not is_free else None,
            price_initial_formatted=details.get("price_initial_formatted"),
            price_final_formatted="Free" if is_free else details.get("price_final_formatted"),
            price_discount=details.get("price_discount", 0),
            price_currency=details.get("price_currency"),
            timestamp=int(datetime.now(timezone.utc).timestamp()),
        )
    except SteamAPIError as exc:
        logger.error("Steam API error fetching price for app %s: %s", app_id, exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Unexpected error fetching price for app %s", app_id)
        raise HTTPException(status_code=500, detail="Internal server error") from exc


@router.get("/steam/details/{app_id}", response_model=GameDetailsResponse)
def get_steam_details(app_id: int):
    try:
        details = fetch_app_details(app_id, use_cache=False)
        if not details:
            raise HTTPException(status_code=404, detail="Game not found")

        is_free = details.get("is_free", False)

        return GameDetailsResponse(
            app_id=app_id,
            name=details.get("name", ""),
            release_date=details.get("release_date"),
            coming_soon=details.get("coming_soon", False),
            developers=details.get("developers", []),
            publishers=details.get("publishers", []),
            genres=details.get("genres", []),
            categories=details.get("categories", []),
            is_free=is_free,
            price_initial=details.get("price_initial"),
            price_final=details.get("price_final") if not is_free else None,
            price_discount=details.get("price_discount", 0),
            price_currency=details.get("price_currency"),
            timestamp=int(datetime.now(timezone.utc).timestamp()),
        )
    except SteamAPIError as exc:
        logger.error("Steam API error fetching details for app %s: %s", app_id, exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Unexpected error fetching details for app %s", app_id)
        raise HTTPException(status_code=500, detail="Internal server error") from exc


@router.get("/steam/achievements/{app_id}", response_model=AchievementsResponse)
def get_steam_achievements(app_id: int, limit: int = 50):
    try:
        achievements = fetch_achievements_with_stats(app_id)

        completion_rate = None
        if achievements:
            completion_rate = sum(a["percent"] for a in achievements) / len(achievements)

        limited_achievements = achievements[:limit]

        return AchievementsResponse(
            app_id=app_id,
            achievements=[
                AchievementResponse(
                    name=a["name"],
                    display_name=a["display_name"],
                    description=a["description"],
                    percent=a["percent"],
                    icon=a["icon"],
                    icon_gray=a["icon_gray"],
                    hidden=a["hidden"],
                )
                for a in limited_achievements
            ],
            total_count=len(achievements),
            completion_rate=completion_rate,
        )
    except SteamAPIError as exc:
        logger.error("Steam API error fetching achievements for app %s: %s", app_id, exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Unexpected error fetching achievements for app %s", app_id)
        raise HTTPException(status_code=500, detail="Internal server error") from exc


@router.get("/steam/context/{app_id}", response_model=GameContextResponse)
def get_steam_game_context(app_id: int, news_count: int = 5):
    try:
        with ThreadPoolExecutor(max_workers=3) as executor:
            details_future = executor.submit(fetch_app_details, app_id)
            players_future = executor.submit(fetch_current_players, app_id)
            news_future = executor.submit(fetch_news_for_app, app_id, count=news_count, max_length=300)

            details = details_future.result()
            current_players = players_future.result()
            news_items = news_future.result()

        return GameContextResponse(
            app_id=app_id,
            name=details.get("name") if details else None,
            short_description=details.get("short_description") if details else None,
            genres=details.get("genres", []) if details else [],
            categories=details.get("categories", []) if details else [],
            header_image=details.get("header_image") if details else None,
            current_players=current_players,
            recent_news=[
                NewsItemResponse(
                    gid=item.gid,
                    title=item.title,
                    url=item.url,
                    author=item.author,
                    contents=item.contents,
                    feed_label=item.feed_label,
                    date=item.date,
                    feed_name=item.feed_name,
                    feed_type=item.feed_type,
                )
                for item in news_items
            ],
        )
    except SteamAPIError as exc:
        logger.error("Steam API error fetching context for app %s: %s", app_id, exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Unexpected error fetching context for app %s", app_id)
        raise HTTPException(status_code=500, detail="Internal server error") from exc
