"""Review, label, and database endpoints."""

from __future__ import annotations

import csv
import io
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from .. import storage, llm
from ..steam_api import fetch_app_details
from .. import build_reviews_dataframe, ingest
from ._shared import (
    DatabaseReviewItem,
    DatabaseReviewsResponse,
    DatabaseGameOption,
    REVIEW_EXPORT_COLUMNS,
    SAMPLE_LIMIT,
    EXPORT_MAX_ROWS,
    _database_row_to_item,
    _serialize_export_value,
)
from ._guards import require_destructive_access

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class FeedbackItem(BaseModel):
    feedback_id: str
    app_id: int
    source: str
    text: str
    created_at: Optional[str] = None
    author: Optional[str] = None
    language: Optional[str] = None
    engagement: Optional[dict] = None
    url: Optional[str] = None
    context: Optional[dict] = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/feedback/{app_id}", response_model=List[FeedbackItem])
def aggregate_feedback(
    app_id: int,
    include_reddit: bool = True,
    include_discord: bool = True,
    include_steam_forums: bool = True,
    steam_limit: int = 200,
    reddit_limit: int = 50,
    discord_limit: int = 50,
    forum_limit: int = 30,
) -> List[FeedbackItem]:
    user_id = "local"
    if not storage.user_has_game(user_id, app_id):
        raise HTTPException(status_code=404, detail="No analysis available for this game.")
    game_context = fetch_app_details(app_id) or {}
    app_name = game_context.get("name", str(app_id))

    steam_reviews = storage.load_reviews(app_id, limit=steam_limit)
    combined = ingest.collect_feedback(
        app_id,
        app_name,
        steam_reviews,
        include_reddit=include_reddit,
        include_discord=include_discord,
        include_steam_forums=include_steam_forums,
        reddit_limit=reddit_limit,
        discord_limit=discord_limit,
        forum_limit=forum_limit,
    )
    return [FeedbackItem(**item) for item in combined]


@router.get("/reviews/{app_id}")
def export_reviews(
    app_id: int,
    limit: Optional[int] = None,
    format: str = "csv",
    refresh: bool = False,
):
    user_id = "local"
    if not storage.user_has_game(user_id, app_id):
        raise HTTPException(status_code=404, detail="No analysis available for this game.")
    rows = storage.load_reviews(app_id, limit)
    if not rows:
        raise HTTPException(
            status_code=404,
            detail="No cached reviews for this app. Run an analysis with persistence enabled.",
        )

    if refresh:
        try:
            game_context = fetch_app_details(app_id)
            with llm.llm_usage_context(user_id=user_id, app_id=app_id, operation="export_refresh"):
                llm_labels = llm.ensure_review_labels(app_id, rows, game_context=game_context)
        except ValueError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        except Exception as exc:
            logger.exception("Label refresh failed for app %s: %s", app_id, exc)
            raise HTTPException(status_code=500, detail="Failed to refresh review labels.") from exc
    else:
        cached_labels = storage.load_review_labels(app_id)
        if not cached_labels:
            raise HTTPException(
                status_code=409,
                detail="No cached labels available. Re-run analysis or set refresh=true to regenerate.",
            )
        llm_labels = {rid: data.get("payload", {}) for rid, data in cached_labels.items()}

    df = build_reviews_dataframe(rows)
    df = llm.apply_review_labels(df, llm_labels)
    export_columns = [col for col in REVIEW_EXPORT_COLUMNS if col in df.columns]
    if not export_columns:
        raise HTTPException(status_code=500, detail="No exportable columns found.")

    if format == "json":
        data = df[export_columns].to_json(orient="records", date_format="iso", date_unit="s")
        return StreamingResponse(
            iter([data]),
            media_type="application/json",
            headers={
                "Content-Disposition": f"attachment; filename=senti-next-reviews-{app_id}.json",
            },
        )

    csv_data = df[export_columns].to_csv(index=False)
    return StreamingResponse(
        iter([csv_data]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=senti-next-reviews-{app_id}.csv",
        },
    )


# ---------------------------------------------------------------------------
# Database browser endpoints
# ---------------------------------------------------------------------------

@router.get("/database/stats")
def database_stats() -> dict:
    return storage.get_database_stats(None)


@router.delete("/database/labels", status_code=200)
def clear_labels(old_schema_only: bool = False, _: None = Depends(require_destructive_access)) -> dict:
    if old_schema_only:
        count = storage.clear_old_schema_labels()
        return {"deleted": count, "scope": "old_schema_labels"}
    else:
        count = storage.clear_all_labels()
        return {"deleted": count, "scope": "all_labels"}


@router.delete("/database/clear", status_code=200)
def clear_database(_: None = Depends(require_destructive_access)) -> dict:
    counts = storage.clear_entire_database()
    return {"deleted": counts, "scope": "entire_database"}


@router.get("/database/games", response_model=List[DatabaseGameOption])
def database_games() -> List[DatabaseGameOption]:
    entries = storage.list_database_games_all()
    return [DatabaseGameOption(**entry) for entry in entries]


@router.get("/database/reviews/{review_id}")
def get_database_review_by_id(review_id: str):
    user_id = "local"
    review_row = storage.get_review_by_id(review_id)
    if not review_row:
        raise HTTPException(status_code=404, detail="Review not found")

    app_id = review_row["app_id"]
    user_games = storage.list_database_games(user_id)

    games_map = {entry["app_id"]: entry.get("name") for entry in user_games}
    review_item = _database_row_to_item(review_row, games_map)

    return {"review": review_item}


@router.get("/database/reviews", response_model=DatabaseReviewsResponse)
def database_reviews(
    limit: int = Query(default=200, le=1000),
    offset: int = Query(default=0, ge=0),
    app_id: Optional[int] = None,
    language: Optional[str] = None,
    query: Optional[str] = None,
) -> DatabaseReviewsResponse:
    user_games = storage.list_database_games_all()
    rows, total = storage.load_database_reviews(
        limit=limit,
        offset=offset,
        app_id=app_id,
        language=language,
        query=query,
        app_ids=None,
    )
    games_map = {entry["app_id"]: entry.get("name") for entry in user_games}
    items: List[DatabaseReviewItem] = []

    for row in rows:
        items.append(_database_row_to_item(row, games_map))

    return DatabaseReviewsResponse(items=items, total=int(total), offset=int(offset), limit=int(limit))


@router.get("/database/reviews/count")
def database_reviews_count(
    app_id: Optional[int] = None,
    language: Optional[str] = None,
    query: Optional[str] = None,
):
    user_games = storage.list_database_games_all()

    _, total = storage.load_database_reviews(
        limit=1,
        offset=0,
        app_id=app_id,
        language=language,
        query=query,
        app_ids=None,
    )

    top_games = []
    if not app_id:
        games_map = {entry["app_id"]: entry.get("name") for entry in user_games}
        top_rows = storage.get_top_games_by_review_count(
            limit=5,
            language=language,
            query=query,
        )
        top_games = [
            {"app_id": row["app_id"], "name": games_map.get(row["app_id"], f"App {row['app_id']}"), "count": row["count"]}
            for row in top_rows
        ]

    return {
        "total": int(total),
        "games": len(user_games) if not app_id else 1,
        "top_games": top_games,
    }


@router.get("/database/export")
def database_export(
    format: str = "csv",
    app_id: Optional[int] = None,
    language: Optional[str] = None,
    query: Optional[str] = None,
    max_rows: Optional[int] = None,
):
    export_format = (format or "csv").strip().lower()
    if export_format not in {"csv", "jsonl"}:
        raise HTTPException(status_code=400, detail="Unsupported export format. Use csv or jsonl.")

    user_games = storage.list_database_games_all()
    games_map = {entry["app_id"]: entry.get("name") for entry in user_games}

    if max_rows is None:
        max_rows_value = EXPORT_MAX_ROWS
    else:
        try:
            max_rows_value = int(max_rows)
        except Exception:
            max_rows_value = EXPORT_MAX_ROWS
    if max_rows_value <= 0:
        max_rows_value = EXPORT_MAX_ROWS
    max_rows_value = min(max_rows_value, EXPORT_MAX_ROWS)

    now_stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    app_label = str(app_id) if app_id else "all"
    ext = "csv" if export_format == "csv" else "jsonl"
    filename = f"sentinext-dataset-{app_label}-{now_stamp}.{ext}"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}

    def iter_review_items():
        offset_value = 0
        remaining = max_rows_value
        page_size = 500
        while remaining > 0:
            page_limit = min(page_size, remaining)
            rows, _total = storage.load_database_reviews(
                limit=page_limit,
                offset=offset_value,
                app_id=app_id,
                language=language,
                query=query,
                app_ids=None,
            )
            if not rows:
                break
            for row in rows:
                yield _database_row_to_item(row, games_map)
            offset_value += len(rows)
            remaining -= len(rows)
            if len(rows) < page_limit:
                break

    if export_format == "jsonl":
        def iter_jsonl():
            for item in iter_review_items():
                payload = item.dict()
                yield (json.dumps(payload, ensure_ascii=False) + "\n").encode("utf-8")

        return StreamingResponse(iter_jsonl(), media_type="application/x-ndjson", headers=headers)

    def iter_csv():
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=REVIEW_EXPORT_COLUMNS, extrasaction="ignore")
        writer.writeheader()
        yield output.getvalue().encode("utf-8")
        output.seek(0)
        output.truncate(0)

        buffered = 0
        for item in iter_review_items():
            payload = item.dict()
            row = {key: _serialize_export_value(payload.get(key)) for key in REVIEW_EXPORT_COLUMNS}
            writer.writerow(row)
            buffered += 1
            if buffered >= 100:
                yield output.getvalue().encode("utf-8")
                output.seek(0)
                output.truncate(0)
                buffered = 0

        if output.tell():
            yield output.getvalue().encode("utf-8")

    return StreamingResponse(iter_csv(), media_type="text/csv", headers=headers)
