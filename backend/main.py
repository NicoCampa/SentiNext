from __future__ import annotations

import json
import logging
import os
import secrets
from datetime import datetime
import hashlib
from pathlib import Path
from typing import List, Optional
import uuid

import pandas as pd

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from .senti_next import (
    SteamAPIError,
    build_reviews_dataframe,
    fetch_reviews,
    search_applications,
)
from .senti_next import ingest
from .senti_next.steam_api import fetch_app_details
from .senti_next.insights import prepare_insights
from .senti_next import storage
from .senti_next import llm
from .reports import render_single_report, render_compare_report
from .pdf_report import render_insights_pdf
from .emailer import EmailConfigError, send_pdf_email

logger = logging.getLogger(__name__)

SAMPLE_LIMIT = 1000
FETCH_LIMIT = 2000
PDF_REVIEW_LIMIT = 100  # hard cap for testing

APP_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

def _parse_allowed_origins() -> list[str]:
    raw = os.getenv("SENTINEXT_ALLOWED_ORIGINS")
    if not raw:
        return APP_ORIGINS
    origins = [item.strip() for item in raw.split(",") if item.strip()]
    return origins or APP_ORIGINS

ALLOWED_ORIGINS = _parse_allowed_origins()

ADMIN_TOKEN = os.getenv("SENTINEXT_ADMIN_TOKEN")
DESTRUCTIVE_ENABLED = os.getenv("SENTINEXT_ENABLE_DESTRUCTIVE", "false").lower() in {"1", "true", "yes"}
SERVICE_TOKEN = os.getenv("SENTINEXT_SERVICE_TOKEN")

storage.init_db()

app = FastAPI(title="SentiNext API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SearchResult(BaseModel):
    appid: int
    name: str
    price: Optional[str] = None
    url: str


class AnalyzeRequest(BaseModel):
    app_id: int = Field(..., gt=0)
    review_count: int = Field(FETCH_LIMIT, ge=0, le=FETCH_LIMIT)
    language: str = Field("english", min_length=2, max_length=32)
    filter: str = Field("recent")
    day_range: Optional[int] = Field(None, ge=1, le=365)
    persist: bool = Field(True)
    refresh: bool = Field(False)
    refresh_days: Optional[int] = Field(None, ge=1, le=365, description="Only fetch reviews from the last N days")


class AnalyzeMetadata(BaseModel):
    app_id: int
    requested: int
    retrieved: int
    language: str
    fetched_at: str


class AnalyzeResponse(BaseModel):
    metadata: AnalyzeMetadata
    insights: Optional[dict]
    reviews: List[dict]


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


class AnalysisStatusResponse(BaseModel):
    status: str
    metadata: Optional[AnalyzeMetadata] = None
    insights: Optional[dict] = None
    reviews: List[dict] = Field(default_factory=list)
    error: Optional[str] = None
    run_id: Optional[str] = None
    snapshot_hash: Optional[str] = None
    stale: bool = False
    stale_reason: Optional[str] = None


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


class PdfReportRequest(BaseModel):
    app_id: int = Field(..., gt=0)
    email: str = Field(..., min_length=3, max_length=320)
    review_count: int = Field(PDF_REVIEW_LIMIT, ge=1, le=PDF_REVIEW_LIMIT)
    language: str = Field("english", min_length=2, max_length=32)
    filter: str = Field("recent")
    day_range: Optional[int] = Field(None, ge=1, le=365)


class PdfReportJobResponse(BaseModel):
    job_id: str
    status: str
    created_at: str


class PdfReportStatusResponse(BaseModel):
    job_id: str
    app_id: int
    email: str
    status: str
    error: Optional[str] = None
    updated_at: str


REVIEW_EXPORT_COLUMNS = [
    # Review content
    "review_id",
    "review",
    "language",
    "created_at",
    # Steam sentiment (thumbs up/down)
    "voted_up",
    # Engagement metrics
    "votes_up",
    "votes_funny",
    # Author info
    "author_num_games_owned",
    "author_num_reviews",
    "author_playtime_forever",
    "author_playtime_last_two_weeks",
    "author_playtime_hours",
    "author_recent_playtime_hours",
    # LLM v7 classification
    "llm_main_category",
    "llm_subcategory",
    "llm_specific_issues",
    "llm_feature_request",
    "llm_urgency",
    # LLM v8 structured insights
    "llm_issues",
    "llm_feature_requests",
]

def require_admin(request: Request) -> None:
    """Guard destructive endpoints behind an admin token + feature flag."""
    if not DESTRUCTIVE_ENABLED:
        raise HTTPException(status_code=403, detail="Destructive endpoints are disabled. Set SENTINEXT_ENABLE_DESTRUCTIVE=1 to allow.")
    if not ADMIN_TOKEN:
        raise HTTPException(status_code=403, detail="Admin token not configured. Set SENTINEXT_ADMIN_TOKEN.")
    provided = request.headers.get("x-admin-token") or ""
    if not secrets.compare_digest(provided, ADMIN_TOKEN):
        raise HTTPException(status_code=401, detail="Invalid admin token.")

def require_service_token(request: Request) -> None:
    """Optional shared-secret auth for website-to-backend calls."""
    if not SERVICE_TOKEN:
        return
    provided = request.headers.get("x-service-token") or ""
    if not secrets.compare_digest(provided, SERVICE_TOKEN):
        raise HTTPException(status_code=401, detail="Invalid service token.")


@app.get("/health")
def healthcheck() -> dict:
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat() + "Z"}

@app.get("/admin/status")
def admin_status() -> dict:
    """Expose whether destructive endpoints are available (no secrets)."""
    return {
        "destructive_enabled": DESTRUCTIVE_ENABLED,
        "token_configured": bool(ADMIN_TOKEN),
    }

@app.post("/admin/verify")
def admin_verify(_: None = Depends(require_admin)) -> dict:
    """Non-destructive endpoint to validate admin auth."""
    return {"ok": True}


@app.get("/search", response_model=List[SearchResult])
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
        SearchResult(appid=item.appid, name=item.name, price=item.price, url=item.url)
        for item in results
    ]


def _run_analysis_job(app_id: int, all_reviews: List[dict], metadata: AnalyzeMetadata, game_context: Optional[dict]) -> None:
    run_id = hashlib.sha256(f"{app_id}-{datetime.utcnow().isoformat()}".encode("utf-8")).hexdigest()[:16]
    snapshot_hash = hashlib.sha256(json.dumps(all_reviews, sort_keys=True, default=str).encode("utf-8")).hexdigest()[:16]
    context_hash = hashlib.sha256(json.dumps(game_context or {}, sort_keys=True, default=str).encode("utf-8")).hexdigest()[:16]
    total_reviews = len(all_reviews)
    progress_active = total_reviews > 0

    if progress_active:
        storage.reset_progress(app_id, total_reviews)
        last_update = [0]

        def _progress_callback(processed: int, total: int) -> None:
            try:
                if total <= 20:
                    storage.update_progress(app_id, processed, total)
                    last_update[0] = processed
                elif total <= 100:
                    if processed == total or processed - last_update[0] >= 5:
                        storage.update_progress(app_id, processed, total)
                        last_update[0] = processed
                else:
                    if processed == total or processed - last_update[0] >= 10:
                        storage.update_progress(app_id, processed, total)
                        last_update[0] = processed
            except Exception as exc:  # pragma: no cover - defensive
                logger.warning("Progress update failed: %s", exc)
    else:
        storage.clear_progress(app_id)

    try:
        llm_labels = llm.ensure_review_labels(
            app_id,
            all_reviews,
            progress_callback=_progress_callback if progress_active else None,
            game_context=game_context,
        )

        df = build_reviews_dataframe(all_reviews)
        df = llm.apply_review_labels(df, llm_labels)

        if df is None or df.empty:
            storage.save_analysis_result(app_id, metadata.dict(), None, [], status="completed", run_id=run_id, snapshot_hash=snapshot_hash, context_hash=context_hash)
            return

        insights = prepare_insights(df)

        export_columns = [col for col in REVIEW_EXPORT_COLUMNS if col in df.columns]
        if export_columns:
            sample_limit = min(SAMPLE_LIMIT, df.shape[0])
            reviews_payload = json.loads(
                df[export_columns]
                .head(sample_limit)
                .to_json(orient="records", date_format="iso", date_unit="s")
            )
        else:
            reviews_payload = []

        storage.save_analysis_result(
            app_id=app_id,
            metadata=metadata.dict(),
            insights=insights,
            reviews=reviews_payload,
            status="completed",
            run_id=run_id,
            snapshot_hash=snapshot_hash,
            context_hash=context_hash,
        )
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception("Analysis job failed: %s", exc)
        storage.save_analysis_result(
            app_id=app_id,
            metadata=metadata.dict(),
            insights=None,
            reviews=[],
            status="failed",
            error=str(exc),
            run_id=run_id,
            snapshot_hash=snapshot_hash,
            context_hash=context_hash,
        )
    finally:
        if progress_active:
            storage.update_progress(app_id, total_reviews, total_reviews)
            storage.clear_progress(app_id)


def _reports_dir() -> Path:
    raw = os.getenv("SENTINEXT_REPORTS_DIR")
    if raw:
        return Path(raw).expanduser()
    # Default to the same data dir root as the DB.
    return storage.db_path().parent / "reports"


def _run_pdf_report_job(job_id: str, request: PdfReportRequest) -> None:
    storage.update_pdf_job(job_id, status="running")
    try:
        app_id = int(request.app_id)
        use_cache = os.getenv("SENTINEXT_PDF_USE_CACHE", "false").lower() in {"1", "true", "yes"}
        game_context = fetch_app_details(app_id) or {} if not use_cache else {}
        game_name = game_context.get("name", str(app_id))

        filter_type = (request.filter or "recent").lower()
        if filter_type not in {"recent", "updated", "all", "recent_created", "best"}:
            filter_type = "recent"

        if use_cache:
            reviews = storage.load_reviews(app_id, limit=min(int(request.review_count), PDF_REVIEW_LIMIT))
            if not reviews:
                raise RuntimeError(
                    "No cached reviews available (SENTINEXT_PDF_USE_CACHE=1). "
                    "Run an analysis with persistence enabled first, or disable cache mode."
                )
        else:
            reviews = fetch_reviews(
                app_id,
                count=min(int(request.review_count), PDF_REVIEW_LIMIT),
                language=request.language,
                filter_type=filter_type,
                day_range=request.day_range,
            )

        metadata = AnalyzeMetadata(
            app_id=app_id,
            requested=min(int(request.review_count), PDF_REVIEW_LIMIT),
            retrieved=len(reviews),
            language=request.language,
            fetched_at=datetime.utcnow().isoformat() + "Z",
        )

        # No caching: always re-label with fresh prompt/model and skip cache writes via env.
        llm_labels = llm.ensure_review_labels(
            app_id=app_id,
            reviews=reviews,
            force_refresh=True,
            game_context=game_context,
            cache_enabled=False,
        )

        df = build_reviews_dataframe(reviews)
        df = llm.apply_review_labels(df, llm_labels)
        if df is None or df.empty:
            raise RuntimeError("No reviews available to analyze.")

        insights = prepare_insights(df)
        pdf_bytes = render_insights_pdf(
            app_id=app_id,
            game_name=game_name,
            metadata=metadata.dict(),
            insights=insights or {},
            game_image_url=(
                game_context.get("header_image")
                or f"https://cdn.akamai.steamstatic.com/steam/apps/{app_id}/header.jpg"
            ),
        )

        reports_dir = _reports_dir()
        reports_dir.mkdir(parents=True, exist_ok=True)
        filename = f"sentinext-report-{app_id}-{job_id}.pdf"
        path = reports_dir / filename
        path.write_bytes(pdf_bytes)

        send_pdf_email(
            to_email=request.email,
            subject=f"SentiNext report for {game_name} (app {app_id})",
            body_text=(
                f"Your SentiNext report is attached.\n\n"
                f"Game: {game_name} (app {app_id})\n"
                f"Generated: {datetime.utcnow().isoformat()}Z\n"
                f"Reviews analyzed: {len(reviews)}\n"
            ),
            pdf_bytes=pdf_bytes,
            filename=filename,
        )

        storage.update_pdf_job(job_id, status="completed", file_path=str(path))
    except EmailConfigError as exc:
        storage.update_pdf_job(job_id, status="failed", error=str(exc))
    except Exception as exc:
        logger.exception("PDF job failed: %s", exc)
        storage.update_pdf_job(job_id, status="failed", error=str(exc))


@app.post("/analyze", response_model=AnalyzeResponse, status_code=202)
def analyze(request: AnalyzeRequest, background_tasks: BackgroundTasks) -> AnalyzeResponse:
    filter_type = (request.filter or "recent").lower()
    if filter_type not in {"recent", "updated", "all", "recent_created", "best"}:
        filter_type = "recent"

    stored_reviews: List[dict] = []
    if request.persist:
        stored_reviews = storage.load_reviews(request.app_id)

    should_fetch = not stored_reviews or request.refresh or not request.persist

    fetched_reviews: List[dict] = []
    if should_fetch:
        try:
            fetched_reviews = fetch_reviews(
                request.app_id,
                count=request.review_count,
                language=request.language,
                filter_type=filter_type,
                day_range=request.refresh_days or request.day_range,
            )
        except SteamAPIError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

        if request.persist:
            storage.upsert_reviews(request.app_id, fetched_reviews)
            stored_reviews = storage.load_reviews(request.app_id)
        else:
            stored_reviews = fetched_reviews

    if stored_reviews:
        all_reviews = stored_reviews
    else:
        all_reviews = fetched_reviews

    # Always apply review_count limit if specified
    if request.review_count and len(all_reviews) > request.review_count:
        all_reviews = all_reviews[: request.review_count]

    metadata = AnalyzeMetadata(
        app_id=request.app_id,
        requested=request.review_count,
        retrieved=len(all_reviews),
        language=request.language,
        fetched_at=datetime.utcnow().isoformat() + "Z",
    )

    # Persist placeholder result and kick off background job
    storage.save_analysis_result(
        app_id=request.app_id,
        metadata=metadata.dict(),
        insights=None,
        reviews=[],
        status="running",
        run_id=None,
        snapshot_hash=None,
        stale=False,
    )
    storage.clear_progress(request.app_id)

    game_context = fetch_app_details(request.app_id)
    if game_context:
        logger.info(f"Fetched game context for {game_context.get('name', request.app_id)}")

    background_tasks.add_task(_run_analysis_job, request.app_id, all_reviews, metadata, game_context)

    return AnalyzeResponse(metadata=metadata, insights=None, reviews=[])


@app.get("/analysis/{app_id}", response_model=AnalysisStatusResponse)
def get_analysis_result(app_id: int) -> AnalysisStatusResponse:
    result = storage.load_analysis_result(app_id)
    if not result:
        raise HTTPException(status_code=404, detail="No analysis result available for this app.")

    metadata_payload = result.get("metadata")
    metadata = AnalyzeMetadata(**metadata_payload) if metadata_payload else None
    stale_reason = None
    if metadata and metadata.fetched_at:
        try:
            fetched_dt = datetime.fromisoformat(metadata.fetched_at.replace("Z", "+00:00"))
            max_age_days = int(os.getenv("SENTINEXT_STALE_DAYS", "30"))
            age_days = (datetime.utcnow() - fetched_dt.replace(tzinfo=None)).days
            if age_days > max_age_days:
                result["stale"] = True
                stale_reason = f"Analysis older than {max_age_days} days"
        except Exception:
            pass
    # Compare app context hash to detect build/content changes
    try:
        app_details = fetch_app_details(app_id) or {}
        current_ctx_hash = hashlib.sha256(json.dumps(app_details, sort_keys=True, default=str).encode("utf-8")).hexdigest()[:16]
        stored_hash = result.get("context_hash")
        if stored_hash and current_ctx_hash != stored_hash:
            result["stale"] = True
            stale_reason = stale_reason or "App details changed since last run"
    except Exception:
        logger.warning("Failed to compare app context hash for %s", app_id)

    return AnalysisStatusResponse(
        status=result.get("status", "unknown"),
        metadata=metadata,
        insights=result.get("insights"),
        reviews=result.get("reviews") or [],
        error=result.get("error"),
        run_id=result.get("run_id"),
        snapshot_hash=result.get("snapshot_hash"),
        stale=bool(result.get("stale")),
        stale_reason=stale_reason,
    )


@app.get("/feedback/{app_id}", response_model=List[FeedbackItem])
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
    """Aggregate normalized feedback across Steam reviews, Reddit, Discord, and Steam forums."""
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


@app.get("/report/{app_id}")
def export_report(app_id: int, format: str = "html"):
    result = storage.load_analysis_result(app_id)
    if not result or not result.get("insights"):
        raise HTTPException(status_code=404, detail="No analysis result available for this app.")
    metadata = result.get("metadata") or {}
    insights = result.get("insights") or {}
    name = fetch_app_details(app_id).get("name", str(app_id)) if fetch_app_details(app_id) else str(app_id)
    if format == "json":
        return {"app_id": app_id, "name": name, "metadata": metadata, "insights": insights}
    return render_single_report(app_id, name, metadata, insights)


@app.get("/compare/export")
def export_comparison(app_ids: Optional[str] = None, format: str = "html"):
    ids = []
    if app_ids:
        try:
            ids = [int(x) for x in app_ids.split(",") if x.strip()]
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid app_ids")

    entries = storage.load_starred_games()
    if ids:
        entries = [e for e in entries if e.get("app_id") in ids]
    if not entries:
        raise HTTPException(status_code=404, detail="No matching starred games")

    games_payload = []
    for item in entries:
        games_payload.append(
            {
                "app_id": item["app_id"],
                "name": item["name"],
                "metadata": item.get("metadata"),
                "insights": item.get("insights"),
            }
        )

    if format == "json":
        return games_payload
    return render_compare_report(games_payload)


@app.post("/report/pdf", response_model=PdfReportJobResponse, status_code=202)
def request_pdf_report(
    payload: PdfReportRequest,
    background_tasks: BackgroundTasks,
    _: None = Depends(require_service_token),
) -> PdfReportJobResponse:
    job_id = uuid.uuid4().hex
    storage.create_pdf_job(job_id, payload.app_id, payload.email)
    background_tasks.add_task(_run_pdf_report_job, job_id, payload)
    return PdfReportJobResponse(
        job_id=job_id,
        status="queued",
        created_at=datetime.utcnow().isoformat() + "Z",
    )


@app.get("/report/pdf/status/{job_id}", response_model=PdfReportStatusResponse)
def pdf_report_status(job_id: str, _: None = Depends(require_service_token)) -> PdfReportStatusResponse:
    job = storage.load_pdf_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    updated_at = datetime.utcfromtimestamp(job["updated_at"]).isoformat() + "Z" if job.get("updated_at") else None
    return PdfReportStatusResponse(
        job_id=job["job_id"],
        app_id=job["app_id"],
        email=job["email"],
        status=job["status"],
        error=job.get("error"),
        updated_at=updated_at or "",
    )

@app.get("/reviews/{app_id}")
def export_reviews(app_id: int, limit: Optional[int] = None, format: str = "csv", refresh: bool = False):
    rows = storage.load_reviews(app_id, limit)
    if not rows:
        raise HTTPException(
            status_code=404,
            detail="No cached reviews for this app. Run an analysis with persistence enabled.",
        )

    if refresh:
        game_context = fetch_app_details(app_id)
        llm_labels = llm.ensure_review_labels(app_id, rows, game_context=game_context)
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

    # default CSV
    csv_data = df[export_columns].to_csv(index=False)
    return StreamingResponse(
        iter([csv_data]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=senti-next-reviews-{app_id}.csv",
        },
    )


@app.get("/progress/{app_id}")
def classification_progress(app_id: int) -> dict:
    progress = storage.load_progress(app_id)
    if not progress:
        return {
            "app_id": app_id,
            "total": 0,
            "processed": 0,
            "active": False,
            "updated_at": None,
        }

    total = int(progress.get("total", 0))
    processed = int(progress.get("processed", 0))
    timestamp = progress.get("updated_at")
    updated_at = (
        datetime.utcfromtimestamp(timestamp).isoformat() + "Z"
        if timestamp
        else None
    )

    return {
        "app_id": app_id,
        "total": total,
        "processed": processed,
        "active": processed < total,
        "updated_at": updated_at,
    }


@app.get("/starred", response_model=List[StarredGameResponse])
def list_starred_games() -> List[StarredGameResponse]:
    entries = storage.load_starred_games()
    response: List[StarredGameResponse] = []
    for item in entries:
        metadata_payload = item.get("metadata") or {}
        metadata = AnalyzeMetadata(**metadata_payload)
        updated_at = datetime.utcfromtimestamp(item["updated_at"]).isoformat() + "Z"
        response.append(
            StarredGameResponse(
                app_id=item["app_id"],
                name=item["name"],
                metadata=metadata,
                insights=item.get("insights"),
                sample=item.get("sample", []),
                updated_at=updated_at,
            )
        )
    return response


@app.post("/starred", status_code=204)
def save_starred_game(payload: StarredGamePayload) -> Response:
    sample = payload.sample[:SAMPLE_LIMIT]

    # Fetch game details to get genres and categories
    game_details = fetch_app_details(payload.app_id)
    genres = game_details.get("genres", []) if game_details else []
    categories = game_details.get("categories", []) if game_details else []

    storage.save_starred_game(
        app_id=payload.app_id,
        name=payload.name,
        metadata=payload.metadata.dict(),
        insights=payload.insights,
        sample=sample,
        genres=genres,
        categories=categories,
    )
    return Response(status_code=204)


@app.delete("/starred/{app_id}", status_code=204)
def remove_starred_game(app_id: int, _: None = Depends(require_admin)) -> Response:
    storage.delete_starred_game(app_id)
    return Response(status_code=204)


@app.delete("/games/{app_id}", status_code=204)
def delete_game_data(app_id: int, _: None = Depends(require_admin)) -> Response:
    """Delete all data for a game (reviews, labels, progress, starred)."""
    storage.delete_all_game_data(app_id)
    return Response(status_code=204)


@app.get("/database/stats")
def database_stats() -> dict:
    """Get database statistics (games, reviews, labels counts)."""
    return storage.get_database_stats()


@app.delete("/database/labels", status_code=200)
def clear_labels(old_schema_only: bool = False, _: None = Depends(require_admin)) -> dict:
    """Clear labels from database. If old_schema_only=true, only removes labels with old schema."""
    if old_schema_only:
        count = storage.clear_old_schema_labels()
        return {"deleted": count, "scope": "old_schema_labels"}
    else:
        count = storage.clear_all_labels()
        return {"deleted": count, "scope": "all_labels"}


@app.delete("/database/clear", status_code=200)
def clear_database(_: None = Depends(require_admin)) -> dict:
    """Clear entire database (all games, reviews, labels, progress, starred)."""
    counts = storage.clear_entire_database()
    return {"deleted": counts, "scope": "entire_database"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
