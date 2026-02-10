"""Shared models, helpers, and constants used by multiple route modules."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Union

from pydantic import BaseModel, Field

from ..llm import normalize_taxonomy_payload

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Review limits - configurable via environment
SAMPLE_LIMIT = int(os.getenv("SENTINEXT_SAMPLE_LIMIT", "1000"))
FETCH_LIMIT = int(os.getenv("SENTINEXT_FETCH_LIMIT", "1000"))
EXPORT_MAX_ROWS = max(1, int(os.getenv("SENTINEXT_EXPORT_MAX_ROWS", "50000")))

REVIEW_EXPORT_COLUMNS = [
    "app_id",
    "app_name",
    "review_id",
    "review",
    "language",
    "created_at",
    "voted_up",
    "votes_up",
    "votes_funny",
    "author_num_games_owned",
    "author_num_reviews",
    "author_playtime_forever",
    "author_playtime_last_two_weeks",
    "author_playtime_hours",
    "author_recent_playtime_hours",
    "steam_purchase",
    "received_for_free",
    "primarily_steam_deck",
    "llm_main_category",
    "llm_subcategory",
    "llm_subcategories",
    "llm_issue_subcategories",
    "llm_request_subcategories",
    "llm_subcategory_evidence",
    "llm_has_issue",
    "llm_has_request",
]


# ---------------------------------------------------------------------------
# Pydantic Models (shared across routes)
# ---------------------------------------------------------------------------

class AnalyzeMetadata(BaseModel):
    app_id: int
    requested: int
    retrieved: int
    language: str
    languages: Optional[List[str]] = None
    fetched_at: str
    header_image: Optional[str] = None
    price_initial: Optional[float] = None
    price_final: Optional[Union[float, str]] = None
    price_initial_formatted: Optional[str] = None
    price_final_formatted: Optional[str] = None
    price_discount: Optional[int] = None
    price_currency: Optional[str] = None
    is_free: Optional[bool] = None


class StarredGamePayload(BaseModel):
    app_id: int
    name: str
    metadata: AnalyzeMetadata
    insights: Optional[dict] = None
    sample: List[dict] = Field(default_factory=list)


class StarredGameResponse(BaseModel):
    app_id: int
    name: str
    metadata: AnalyzeMetadata
    insights: Optional[dict]
    sample: List[dict]
    updated_at: str
    is_favorite: bool = False


class DatabaseReviewItem(BaseModel):
    review_id: str
    app_id: int
    app_name: Optional[str] = None
    review: str
    language: Optional[str] = None
    voted_up: bool
    votes_up: int = 0
    votes_funny: int = 0
    author_num_games_owned: int = 0
    author_num_reviews: int = 0
    author_playtime_forever: int = 0
    author_playtime_last_two_weeks: int = 0
    author_playtime_hours: Optional[float] = None
    author_recent_playtime_hours: Optional[float] = None
    created_at: Optional[str] = None
    llm_main_category: Optional[str] = None
    llm_subcategory: Optional[str] = None
    llm_subcategories: List[str] = Field(default_factory=list)
    llm_issue_subcategories: List[str] = Field(default_factory=list)
    llm_request_subcategories: List[str] = Field(default_factory=list)
    llm_subcategory_evidence: Dict[str, List[str]] = Field(default_factory=dict)
    llm_has_issue: bool = False
    llm_has_request: bool = False


class DatabaseReviewsResponse(BaseModel):
    items: List[DatabaseReviewItem]
    total: int
    offset: int
    limit: int


class DatabaseGameOption(BaseModel):
    app_id: int
    name: Optional[str] = None


class NewsItemResponse(BaseModel):
    gid: str
    title: str
    url: str
    author: str
    contents: str
    feed_label: str
    date: int
    feed_name: str
    feed_type: int


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_json_payload(value: Any, fallback: dict) -> dict:
    if value is None:
        return fallback
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return fallback
    return fallback


def _database_row_to_item(row: Dict[str, Any], games_map: Dict[int, Optional[str]]) -> DatabaseReviewItem:
    payload = _parse_json_payload(row.get("data"), {})
    label_payload = _parse_json_payload(row.get("label_payload"), {})
    if label_payload and (
        label_payload.get("subcategories")
        or label_payload.get("main_category")
        or label_payload.get("subcategory")
    ):
        label_payload = normalize_taxonomy_payload(label_payload)

    author = payload.get("author", {}) or {}
    playtime_forever = int(author.get("playtime_forever") or 0)
    playtime_recent = int(author.get("playtime_last_two_weeks") or 0)
    created_ts = payload.get("timestamp_created")
    created_at = (
        datetime.fromtimestamp(created_ts, tz=timezone.utc).isoformat().replace("+00:00", "Z")
        if isinstance(created_ts, (int, float))
        else None
    )

    issue_subcats = label_payload.get("issue_subcategories") or []
    request_subcats = label_payload.get("request_subcategories") or []
    evidence = label_payload.get("evidence")
    if not isinstance(evidence, dict):
        evidence = {}

    app_id_value = int(row.get("app_id") or payload.get("app_id") or 0)

    return DatabaseReviewItem(
        review_id=str(payload.get("recommendationid") or row.get("review_id") or ""),
        app_id=app_id_value,
        app_name=games_map.get(app_id_value),
        review=payload.get("review") or "",
        language=payload.get("language"),
        voted_up=bool(payload.get("voted_up")),
        votes_up=int(payload.get("votes_up") or 0),
        votes_funny=int(payload.get("votes_funny") or 0),
        author_num_games_owned=int(author.get("num_games_owned") or 0),
        author_num_reviews=int(author.get("num_reviews") or 0),
        author_playtime_forever=playtime_forever,
        author_playtime_last_two_weeks=playtime_recent,
        author_playtime_hours=playtime_forever / 60.0 if playtime_forever else 0.0,
        author_recent_playtime_hours=playtime_recent / 60.0 if playtime_recent else 0.0,
        created_at=created_at,
        llm_main_category=label_payload.get("main_category"),
        llm_subcategory=label_payload.get("subcategory"),
        llm_subcategories=list(label_payload.get("subcategories") or []),
        llm_issue_subcategories=list(issue_subcats) if isinstance(issue_subcats, list) else [],
        llm_request_subcategories=list(request_subcats) if isinstance(request_subcats, list) else [],
        llm_subcategory_evidence=evidence,
        llm_has_issue=bool(issue_subcats),
        llm_has_request=bool(request_subcats),
    )


def _serialize_export_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    return str(value)


def resolve_scope_user_id(scope: Optional[str], user_id: str) -> Optional[str]:
    """Resolve scope to user_id. In local mode all users have admin access."""
    if scope and scope.strip().lower() == "all":
        return None
    return user_id
