"""Analysis-related endpoints: /analyze, /progress/*, /analysis/*, /reanalyze, /summarize/*."""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import text

from .. import storage, llm, redis_client, jobs as job_runner, db as db_module
from ..steam_api import fetch_app_details, fetch_news_for_app, SteamAPIError
from ..insights import prepare_insights
from ..analysis import recommended_share_over_time
from .. import (
    fetch_reviews,
    fetch_reviews_multi_language,
    build_reviews_dataframe,
    SteamAPIError,
)
from ._shared import (
    AnalyzeMetadata,
    SAMPLE_LIMIT,
    FETCH_LIMIT,
    REVIEW_EXPORT_COLUMNS,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Request / Response Models
# ---------------------------------------------------------------------------

class AnalyzeRequest(BaseModel):
    app_id: int = Field(..., gt=0)
    review_count: int = Field(FETCH_LIMIT, ge=0, le=FETCH_LIMIT)
    language: str = Field("all", min_length=2, max_length=32)
    languages: Optional[List[str]] = Field(None, description="List of language codes for multi-language analysis")
    filter: str = Field("recent")
    day_range: Optional[int] = Field(None, ge=1, le=365)
    persist: bool = Field(True)
    refresh: bool = Field(False)
    refresh_days: Optional[int] = Field(None, ge=1, le=365, description="Only fetch reviews from the last N days")


class LabelReuseEstimate(BaseModel):
    total_reviews: int
    cached_reviews: int
    llm_reviews: int
    needs_refresh_reviews: int
    empty_reviews: int
    short_reviews: int
    reasons: Dict[str, int] = Field(default_factory=dict)


class AnalyzeResponse(BaseModel):
    metadata: AnalyzeMetadata
    insights: Optional[dict]
    reviews: List[dict]
    label_estimate: Optional[LabelReuseEstimate] = None


class AnalyzeEstimateResponse(BaseModel):
    app_id: int
    will_fetch: bool
    will_persist: bool
    review_count_requested: int
    reviews_considered: int
    cached_labels_total: int
    cached_reviews: int
    needs_refresh_reviews: int
    empty_reviews: int
    short_reviews: int
    llm_reviews: int
    prompt_version: str
    model_id: str
    labeling_strategy: str
    reasons: Dict[str, int] = Field(default_factory=dict)


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
    data_refreshed: bool = False


class ReviewItem(BaseModel):
    review_id: str
    review: str
    voted_up: Optional[bool] = None


class SummarizeSubcategoryRequest(BaseModel):
    app_id: int = Field(..., gt=0)
    subcategory: str = Field(..., min_length=3)
    reviews: List[ReviewItem] = Field(..., min_length=1, max_length=100)
    summary_type: str = Field(default="general", pattern="^(issue|request|general)$")
    summary_context: Optional[str] = Field(
        default=None,
        description="Optional scope/filter context shown in the UI (e.g., language, date range, segment).",
        max_length=1200,
    )


class SummarizeSubcategoryResponse(BaseModel):
    summary: str
    pros: List[str]
    cons: List[str]


class SummarizeWidgetRequest(BaseModel):
    app_id: int = Field(..., gt=0)
    widget_kind: str = Field(..., pattern="^(trend_week|segment|top_issues|top_requests)$")
    widget_label: str = Field(..., min_length=1, max_length=160)
    context: Dict[str, Any] = Field(default_factory=dict)
    reviews: List[dict] = Field(..., min_length=1, max_length=100)


class SummarizeWidgetResponse(BaseModel):
    summary: str
    key_points: List[str] = Field(default_factory=list)
    actions: List[str] = Field(default_factory=list)


class SummarizeRecentReviewsRequest(BaseModel):
    app_id: int = Field(..., gt=0)
    count: int = Field(default=500, ge=10, le=1000)
    filter_context: Optional[str] = Field(default=None, description="Description of active filters for context")


class SummarizeRecentReviewsResponse(BaseModel):
    summary: str
    key_points: List[str] = Field(default_factory=list)
    actions: List[str] = Field(default_factory=list)
    health_score: Optional[int] = None
    sentiment_trend: Optional[str] = None
    top_strengths: List[str] = Field(default_factory=list)
    review_count: int
    start_date: Optional[str] = None
    end_date: Optional[str] = None


class SummarizeNewsRequest(BaseModel):
    app_id: int
    news_count: int = Field(default=10, ge=1, le=30)
    include_sentiment: bool = Field(default=True)


class SummarizeNewsResponse(BaseModel):
    summary: str
    key_updates: List[str] = Field(default_factory=list)
    potential_impacts: List[str] = Field(default_factory=list)
    correlation_insights: Optional[str] = None
    news_count: int


# ---------------------------------------------------------------------------
# Background analysis job
# ---------------------------------------------------------------------------

def _run_analysis_job(
    user_id: str,
    app_id: int,
    all_reviews: List[dict],
    metadata: AnalyzeMetadata,
    game_context: Optional[dict],
) -> None:
    total_reviews = len(all_reviews)
    progress_active = total_reviews > 0
    run_id: Optional[str] = None
    snapshot_hash: Optional[str] = None
    context_hash: Optional[str] = None

    try:
        run_id = hashlib.sha256(f"{app_id}-{datetime.now(timezone.utc).isoformat()}".encode("utf-8")).hexdigest()[:16]
        snapshot_hash = hashlib.sha256(",".join(sorted(str(r.get("recommendationid", "")) for r in all_reviews)).encode()).hexdigest()[:16]
        context_hash = hashlib.sha256(json.dumps(game_context or {}, sort_keys=True, default=str).encode("utf-8")).hexdigest()[:16]
    except Exception as exc:
        logger.warning("Failed to compute analysis hashes: %s", exc)

    if progress_active:
        try:
            storage.reset_progress(user_id, app_id, total_reviews, phase="classifying")
        except Exception as exc:
            logger.error("Failed to reset progress to classifying: %s", exc)

        def _progress_callback(processed: int, total: int) -> None:
            if storage.is_cancelled(user_id, app_id):
                raise InterruptedError("Analysis cancelled by user")
            try:
                storage.update_progress(user_id, app_id, processed, total)
            except Exception as exc:
                logger.warning("Progress update failed: %s", exc)
    else:
        storage.clear_progress(user_id, app_id)

    try:
        with llm.llm_usage_context(user_id=user_id, app_id=app_id, operation="classify"):
            llm_labels = llm.ensure_review_labels(
                app_id,
                all_reviews,
                progress_callback=_progress_callback if progress_active else None,
                game_context=game_context,
            )

        df = build_reviews_dataframe(all_reviews)
        df = llm.apply_review_labels(df, llm_labels)

        if df is None or df.empty:
            storage.save_analysis_result(user_id, app_id, metadata.dict(), None, [], status="completed", run_id=run_id, snapshot_hash=snapshot_hash, context_hash=context_hash)
            return

        storage.update_progress_phase(user_id, app_id, "building_insights")

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

        # Auto-generate health overview
        try:
            baseline = None
            try:
                prev_result = storage.load_analysis_result(user_id, app_id)
                if prev_result:
                    prev_insights = prev_result.get("insights") or {}
                    prev_metadata = prev_result.get("metadata") or {}
                    prev_date = prev_metadata.get("fetched_at") or ""
                    if not prev_date and prev_result.get("updated_at"):
                        try:
                            prev_date = datetime.utcfromtimestamp(prev_result["updated_at"]).strftime("%Y-%m-%d")
                        except Exception:
                            prev_date = ""
                    if prev_insights:
                        baseline = {
                            "date": prev_date,
                            "recommendation_rate": prev_insights.get("recommendation"),
                            "issue_rate": (prev_insights.get("llm") or {}).get("issue_rate"),
                            "request_rate": (prev_insights.get("llm") or {}).get("feature_request_rate"),
                        }
            except Exception:
                pass
            with llm.llm_usage_context(user_id=user_id, app_id=app_id, operation="health_overview"):
                health_overview = llm.generate_health_overview(
                    reviews=reviews_payload,
                    game_context=game_context,
                    baseline=baseline,
                )
            if insights is not None:
                insights["health_overview"] = health_overview
        except Exception as exc:
            logger.warning("Health overview generation failed (non-fatal): %s", exc)
            if insights is not None:
                insights["health_overview"] = None

        storage.save_analysis_result(
            user_id=user_id,
            app_id=app_id,
            metadata=metadata.dict(),
            insights=insights,
            reviews=reviews_payload,
            status="completed",
            run_id=run_id,
            snapshot_hash=snapshot_hash,
            context_hash=context_hash,
        )
    except InterruptedError as exc:
        logger.info(f"Analysis cancelled for app {app_id}: {exc}")
        storage.save_analysis_result(
            user_id=user_id,
            app_id=app_id,
            metadata=metadata.dict(),
            insights=None,
            reviews=[],
            status="cancelled",
            error="Analysis cancelled by user",
            run_id=run_id,
            snapshot_hash=snapshot_hash,
            context_hash=context_hash,
        )
    except Exception as exc:
        logger.exception("Analysis job failed: %s", exc)
        storage.save_analysis_result(
            user_id=user_id,
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
            storage.update_progress(user_id, app_id, total_reviews, total_reviews)
            storage.update_progress_phase(user_id, app_id, "classifying")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/analyze", response_model=AnalyzeResponse, status_code=202)
def analyze(
    request: AnalyzeRequest,
    background_tasks: BackgroundTasks,
) -> AnalyzeResponse:
    user_id = "local"
    filter_type = (request.filter or "recent").lower()
    if filter_type not in {"recent", "updated", "all", "recent_created", "best"}:
        filter_type = "recent"

    running_app_id = storage.has_running_analysis(user_id, exclude_app_id=request.app_id)
    if running_app_id is not None:
        raise HTTPException(
            status_code=429,
            detail={
                "message": "You already have an analysis in progress. Please wait for it to finish or cancel it before starting a new one.",
                "running_app_id": running_app_id,
            },
        )

    existing_result = storage.load_analysis_result(user_id, request.app_id)
    if existing_result and existing_result.get("status") == "running":
        progress = storage.load_progress(user_id, request.app_id)
        if progress is not None:
            updated_ts = progress.get("updated_at", 0)
            age_seconds = (datetime.now(timezone.utc) - datetime.fromtimestamp(updated_ts, tz=timezone.utc)).total_seconds() if updated_ts else float("inf")
            if age_seconds < 300:
                processed = progress.get("processed", 0)
                total = progress.get("total", 0)
                logger.info(f"Analysis already running for app {request.app_id} ({processed}/{total}), age {age_seconds:.0f}s")
                return AnalyzeResponse(
                    metadata=AnalyzeMetadata(**existing_result.get("metadata", {})),
                    insights=None,
                    reviews=[],
                )
            else:
                logger.warning(f"Clearing stale 'running' analysis for app {request.app_id} (no progress for {age_seconds:.0f}s)")
                storage.save_analysis_result(
                    user_id=user_id,
                    app_id=request.app_id,
                    metadata=existing_result.get("metadata", {}),
                    insights=None,
                    reviews=[],
                    status="failed",
                    error="Analysis timed out (stale running state)",
                )
                storage.clear_progress(user_id, request.app_id)

    stored_reviews: List[dict] = []
    if request.persist:
        stored_reviews = storage.load_reviews(request.app_id)

    languages_to_fetch = request.languages or ([request.language] if request.language and request.language != "all" else None)

    language_filtered_reviews = stored_reviews
    if languages_to_fetch:
        language_filtered_reviews = [
            r for r in stored_reviews
            if r.get("language") in languages_to_fetch
        ]

    has_enough_cached = request.review_count > 0 and len(language_filtered_reviews) >= request.review_count
    should_fetch = not stored_reviews or request.refresh or not request.persist or not has_enough_cached

    fetched_reviews: List[dict] = []
    if should_fetch:
        def _fetch_progress_callback(fetched_count: int) -> None:
            try:
                storage.update_fetch_progress(user_id, request.app_id, fetched_count)
            except Exception as exc:
                logger.warning("Fetch progress update failed: %s", exc)

        storage.reset_progress(user_id, request.app_id, total=0, phase="fetching")

        try:
            if languages_to_fetch and len(languages_to_fetch) > 1:
                fetched_reviews = fetch_reviews_multi_language(
                    request.app_id,
                    count=request.review_count,
                    languages=languages_to_fetch,
                    filter_type=filter_type,
                    day_range=request.refresh_days or request.day_range,
                    progress_callback=_fetch_progress_callback,
                )
            else:
                fetched_reviews = fetch_reviews(
                    request.app_id,
                    count=request.review_count,
                    language=languages_to_fetch[0] if languages_to_fetch else "all",
                    filter_type=filter_type,
                    day_range=request.refresh_days or request.day_range,
                    progress_callback=_fetch_progress_callback,
                )
        except SteamAPIError as exc:
            storage.clear_progress(user_id, request.app_id)
            raise HTTPException(status_code=502, detail=str(exc)) from exc

        if request.persist:
            storage.upsert_reviews(request.app_id, fetched_reviews)
            storage.enforce_review_limit(request.app_id)
            stored_reviews = storage.load_reviews(request.app_id)
        else:
            stored_reviews = fetched_reviews

    if stored_reviews:
        all_reviews = stored_reviews
    else:
        all_reviews = fetched_reviews

    if request.review_count and len(all_reviews) > request.review_count:
        all_reviews = all_reviews[: request.review_count]

    all_reviews.sort(key=lambda r: (r.get("language", "english"), -(r.get("timestamp_created") or 0)))

    label_estimate = None
    try:
        estimate = llm.estimate_review_labeling(request.app_id, all_reviews)
        label_estimate = LabelReuseEstimate(
            total_reviews=int(estimate.get("total_reviews", len(all_reviews)) or 0),
            cached_reviews=int(estimate.get("cached_reviews", 0) or 0),
            llm_reviews=int(estimate.get("llm_reviews", 0) or 0),
            needs_refresh_reviews=int(estimate.get("needs_refresh_reviews", 0) or 0),
            empty_reviews=int(estimate.get("empty_reviews", 0) or 0),
            short_reviews=int(estimate.get("short_reviews", 0) or 0),
            reasons={str(key): int(value) for key, value in (estimate.get("reasons") or {}).items() if key},
        )
    except Exception as exc:
        logger.warning("Failed to estimate cached labels for app %s: %s", request.app_id, exc)

    from .. import db as db_mod
    with db_mod.get_connection() as conn:
        lock_acquired = conn.execute(
            text("SELECT pg_try_advisory_lock(:lock_id)"),
            {"lock_id": request.app_id + 1_000_000_000},
        ).scalar()
    if not lock_acquired:
        return AnalyzeResponse(
            metadata=AnalyzeMetadata(
                app_id=request.app_id,
                requested=request.review_count,
                retrieved=0,
                language=request.language,
                fetched_at=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            ),
            insights=None,
            reviews=[],
        )
    with db_mod.get_connection() as conn:
        conn.execute(
            text("SELECT pg_advisory_unlock(:lock_id)"),
            {"lock_id": request.app_id + 1_000_000_000},
        )

    game_context = fetch_app_details(request.app_id)
    header_image = None
    if game_context:
        header_image = game_context.get("header_image")

    metadata = AnalyzeMetadata(
        app_id=request.app_id,
        requested=request.review_count,
        retrieved=len(all_reviews),
        language=request.language,
        languages=languages_to_fetch,
        fetched_at=datetime.now(timezone.utc).isoformat() + "Z",
        header_image=header_image,
    )

    storage.save_analysis_result(
        user_id=user_id,
        app_id=request.app_id,
        metadata=metadata.dict(),
        insights=None,
        reviews=[],
        status="running",
        run_id=None,
        snapshot_hash=None,
        stale=False,
    )
    storage.reset_progress(user_id, request.app_id, total=len(all_reviews), phase="classifying")

    if game_context:
        logger.info(f"Fetched game context for {game_context.get('name', request.app_id)}")

    if redis_client.is_redis_configured():
        import uuid
        job_id = str(uuid.uuid4())
        storage.create_job_registry(job_id, user_id, request.app_id, job_type="analysis")
        redis_client.enqueue_job(
            job_runner.run_analysis_job,
            user_id,
            request.app_id,
            all_reviews,
            metadata.dict(),
            game_context,
            job_id,
            job_timeout=3600,
        )
        logger.info(f"Enqueued analysis job {job_id} for app {request.app_id}")
    else:
        background_tasks.add_task(
            _run_analysis_job,
            user_id,
            request.app_id,
            all_reviews,
            metadata,
            game_context,
        )

    return AnalyzeResponse(metadata=metadata, insights=None, reviews=[], label_estimate=label_estimate)


@router.post("/analyze/estimate", response_model=AnalyzeEstimateResponse)
def analyze_estimate(request: AnalyzeRequest) -> AnalyzeEstimateResponse:
    user_id = "local"
    filter_type = (request.filter or "recent").lower()
    if filter_type not in {"recent", "updated", "all", "recent_created", "best"}:
        filter_type = "recent"

    stored_reviews: List[dict] = []
    if request.persist:
        stored_reviews = storage.load_reviews(request.app_id)

    languages_to_fetch = request.languages or ([request.language] if request.language and request.language != "all" else None)

    language_filtered_reviews = stored_reviews
    if languages_to_fetch:
        language_filtered_reviews = [
            r for r in stored_reviews
            if r.get("language") in languages_to_fetch
        ]

    has_enough_cached = request.review_count > 0 and len(language_filtered_reviews) >= request.review_count
    should_fetch = not stored_reviews or request.refresh or not request.persist or not has_enough_cached

    fetched_reviews: List[dict] = []
    if should_fetch:
        try:
            if languages_to_fetch and len(languages_to_fetch) > 1:
                fetched_reviews = fetch_reviews_multi_language(
                    request.app_id,
                    count=request.review_count,
                    languages=languages_to_fetch,
                    filter_type=filter_type,
                    day_range=request.refresh_days or request.day_range,
                )
            else:
                fetched_reviews = fetch_reviews(
                    request.app_id,
                    count=request.review_count,
                    language=languages_to_fetch[0] if languages_to_fetch else "all",
                    filter_type=filter_type,
                    day_range=request.refresh_days or request.day_range,
                )
        except SteamAPIError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

    all_reviews = stored_reviews if stored_reviews else fetched_reviews
    if request.review_count and len(all_reviews) > request.review_count:
        all_reviews = all_reviews[: request.review_count]

    cached_labels = storage.load_review_labels(request.app_id)
    estimate = llm.estimate_review_labeling(
        request.app_id,
        all_reviews,
    )

    return AnalyzeEstimateResponse(
        app_id=request.app_id,
        will_fetch=bool(should_fetch),
        will_persist=bool(request.persist),
        review_count_requested=int(request.review_count or 0),
        reviews_considered=len(all_reviews),
        cached_labels_total=len(cached_labels),
        cached_reviews=int(estimate.get("cached_reviews", 0) or 0),
        needs_refresh_reviews=int(estimate.get("needs_refresh_reviews", 0) or 0),
        empty_reviews=int(estimate.get("empty_reviews", 0) or 0),
        short_reviews=int(estimate.get("short_reviews", 0) or 0),
        llm_reviews=int(estimate.get("llm_reviews", 0) or 0),
        prompt_version=str(estimate.get("prompt_version") or ""),
        model_id=str(estimate.get("model_id") or ""),
        labeling_strategy=str(estimate.get("labeling_strategy") or ""),
        reasons={str(key): int(value) for key, value in (estimate.get("reasons") or {}).items() if key},
    )


@router.get("/analysis/{app_id}", response_model=AnalysisStatusResponse)
def get_analysis_result(app_id: int) -> AnalysisStatusResponse:
    user_id = "local"
    result = storage.load_analysis_result(user_id, app_id)
    if not result:
        raise HTTPException(status_code=404, detail="No analysis result available for this app.")

    metadata_payload = result.get("metadata")
    if metadata_payload and not metadata_payload.get("header_image"):
        details = fetch_app_details(app_id)
        if details and details.get("header_image"):
            metadata_payload["header_image"] = details["header_image"]
    metadata = AnalyzeMetadata(**metadata_payload) if metadata_payload else None
    stale_reason = None
    if metadata and metadata.fetched_at:
        try:
            fetched_dt = datetime.fromisoformat(metadata.fetched_at.replace("Z", "+00:00"))
            max_age_days = int(os.getenv("SENTINEXT_STALE_DAYS", "30"))
            age_days = (datetime.now(timezone.utc) - fetched_dt).days
            if age_days > max_age_days:
                result["stale"] = True
                stale_reason = f"Analysis older than {max_age_days} days"
        except Exception:
            pass
    try:
        app_details = fetch_app_details(app_id) or {}
        current_ctx_hash = hashlib.sha256(json.dumps(app_details, sort_keys=True, default=str).encode("utf-8")).hexdigest()[:16]
        stored_hash = result.get("context_hash")
        if stored_hash and current_ctx_hash != stored_hash:
            result["stale"] = True
            stale_reason = stale_reason or "App details changed since last run"
    except Exception:
        logger.warning("Failed to compare app context hash for %s", app_id)

    data_refreshed = False
    stored_fingerprint = (metadata_payload or {}).get("review_fingerprint")
    if stored_fingerprint and result.get("status") == "completed":
        try:
            current_fingerprint = storage.get_reviews_fingerprint(app_id)
            if current_fingerprint and current_fingerprint != stored_fingerprint:
                from .. import db as db_mod
                with db_mod.get_connection() as conn:
                    lock_acquired = conn.execute(
                        text("SELECT pg_try_advisory_lock(:lock_id)"),
                        {"lock_id": app_id + 2_000_000_000},
                    ).scalar()
                if not lock_acquired:
                    logger.info("Auto-refresh skipped for app %s -- another rebuild in progress", app_id)
                else:
                    try:
                        stored_reviews = storage.load_reviews(app_id)
                        if stored_reviews:
                            df = build_reviews_dataframe(stored_reviews)
                            if df is not None and not df.empty:
                                llm_labels = storage.load_review_labels(app_id)
                                df = llm.apply_review_labels(df, llm_labels)
                                insights = prepare_insights(df)

                                metadata_payload["review_fingerprint"] = current_fingerprint
                                metadata_payload["retrieved"] = len(stored_reviews)
                                metadata = AnalyzeMetadata(**metadata_payload)

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
                                    user_id=user_id,
                                    app_id=app_id,
                                    metadata=metadata_payload,
                                    insights=insights,
                                    reviews=reviews_payload,
                                    status="completed",
                                    run_id=result.get("run_id"),
                                    snapshot_hash=result.get("snapshot_hash"),
                                    context_hash=result.get("context_hash"),
                                )

                                result["insights"] = insights
                                result["reviews"] = reviews_payload
                                data_refreshed = True
                                logger.info("Auto-refreshed insights for app %s (user %s) -- review pool changed", app_id, user_id)
                    finally:
                        with db_mod.get_connection() as conn:
                            conn.execute(
                                text("SELECT pg_advisory_unlock(:lock_id)"),
                                {"lock_id": app_id + 2_000_000_000},
                            )
        except Exception:
            logger.warning("Auto-refresh failed for app %s, serving cached data", app_id)

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
        data_refreshed=data_refreshed,
    )


@router.post("/analysis/{app_id}/rebuild-insights")
def rebuild_insights(app_id: int) -> dict:
    user_id = "local"
    result = storage.load_analysis_result(user_id, app_id)
    if not result:
        raise HTTPException(status_code=404, detail="No analysis result found for this app.")

    stored_reviews = storage.load_reviews(app_id)
    if not stored_reviews:
        raise HTTPException(status_code=404, detail="No stored reviews found for this app.")

    df = build_reviews_dataframe(stored_reviews)
    if df is None or df.empty:
        raise HTTPException(status_code=400, detail="Could not build DataFrame from stored reviews.")

    llm_labels = storage.load_review_labels(app_id)
    df = llm.apply_review_labels(df, llm_labels)

    insights = prepare_insights(df)

    metadata = result.get("metadata", {})

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
        user_id=user_id,
        app_id=app_id,
        metadata=metadata,
        insights=insights,
        reviews=reviews_payload,
        status="completed",
        run_id=result.get("run_id"),
        snapshot_hash=result.get("snapshot_hash"),
        context_hash=result.get("context_hash"),
    )

    starred_games = storage.load_starred_games(user_id)
    starred = next((entry for entry in starred_games if entry.get("app_id") == app_id), None)
    if starred:
        storage.save_starred_game(
            user_id=user_id,
            app_id=app_id,
            name=starred.get("name") or str(app_id),
            metadata=starred.get("metadata") or {},
            insights=insights,
            sample=starred.get("sample") or [],
            genres=starred.get("genres") or [],
            categories=starred.get("categories") or [],
        )

    return {"status": "ok", "message": "Insights rebuilt successfully", "app_id": app_id}


@router.post("/analysis/{app_id}/rebuild-trends")
def rebuild_trends(app_id: int) -> dict:
    user_id = "local"
    result = storage.load_analysis_result(user_id, app_id)
    if not result:
        raise HTTPException(status_code=404, detail="No analysis result found for this app.")

    stored_reviews = storage.load_reviews(app_id)
    if not stored_reviews:
        raise HTTPException(status_code=404, detail="No stored reviews found for this app.")

    df = build_reviews_dataframe(stored_reviews)
    if df is None or df.empty:
        raise HTTPException(status_code=400, detail="Could not build DataFrame from stored reviews.")

    trend_df = recommended_share_over_time(df, freq="W-SUN", fill_missing=True)
    trend_payload = (
        json.loads(trend_df.to_json(orient="records", date_format="iso", date_unit="s"))
        if trend_df is not None and not trend_df.empty
        else []
    )

    insights = result.get("insights") or {}
    insights["trend"] = trend_payload

    storage.save_analysis_result(
        user_id=user_id,
        app_id=app_id,
        metadata=result.get("metadata", {}),
        insights=insights,
        reviews=result.get("reviews") or [],
        status="completed",
        run_id=result.get("run_id"),
        snapshot_hash=result.get("snapshot_hash"),
        context_hash=result.get("context_hash"),
        stale=result.get("stale", False),
        stale_reason=result.get("stale_reason"),
    )

    starred_games = storage.load_starred_games(user_id)
    starred = next((entry for entry in starred_games if entry.get("app_id") == app_id), None)
    if starred:
        storage.save_starred_game(
            user_id=user_id,
            app_id=app_id,
            name=starred.get("name") or str(app_id),
            metadata=starred.get("metadata") or {},
            insights=insights,
            sample=starred.get("sample") or [],
            genres=starred.get("genres") or [],
            categories=starred.get("categories") or [],
        )

    return {"status": "ok", "message": "Trends rebuilt successfully", "app_id": app_id}


@router.post("/summarize/subcategory", response_model=SummarizeSubcategoryResponse)
def summarize_subcategory(request: SummarizeSubcategoryRequest) -> SummarizeSubcategoryResponse:
    user_id = "local"
    game_context = fetch_app_details(request.app_id)
    try:
        with llm.llm_usage_context(user_id=user_id, app_id=request.app_id, operation="summarize"):
            result = llm.summarize_subcategory_reviews(
                reviews=[r.dict() for r in request.reviews],
                subcategory=request.subcategory,
                game_context=game_context,
                summary_type=request.summary_type,
                summary_context=request.summary_context,
            )
        return SummarizeSubcategoryResponse(**result)
    except Exception as exc:
        logger.exception("Summarize failed: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to generate summary.") from exc


@router.post("/summarize/widget", response_model=SummarizeWidgetResponse)
def summarize_widget(request: SummarizeWidgetRequest) -> SummarizeWidgetResponse:
    user_id = "local"
    game_context = fetch_app_details(request.app_id)
    try:
        with llm.llm_usage_context(user_id=user_id, app_id=request.app_id, operation="summarize"):
            result = llm.summarize_widget_reviews(
                reviews=request.reviews,
                widget_kind=request.widget_kind,
                widget_label=request.widget_label,
                widget_context=request.context,
                game_context=game_context,
            )
        return SummarizeWidgetResponse(**result)
    except Exception as exc:
        logger.exception("Widget summarize failed: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to generate widget summary.") from exc


@router.post("/summarize/recent-reviews", response_model=SummarizeRecentReviewsResponse)
def summarize_recent_reviews(request: SummarizeRecentReviewsRequest) -> SummarizeRecentReviewsResponse:
    user_id = "local"
    stored_reviews = storage.load_reviews(request.app_id, limit=int(request.count or 100))
    if not stored_reviews:
        raise HTTPException(status_code=404, detail="No stored reviews found for this app.")

    game_context = fetch_app_details(request.app_id)

    df = build_reviews_dataframe(stored_reviews)
    if df is None or df.empty:
        raise HTTPException(status_code=404, detail="No review data available for this app.")

    try:
        llm_labels = storage.load_review_labels(request.app_id)
        df = llm.apply_review_labels(df, llm_labels)
    except Exception as exc:
        logger.warning("Failed to apply cached labels for app %s: %s", request.app_id, exc)

    if "created_at" in df.columns:
        try:
            df = df.sort_values(by="created_at", ascending=False)
        except Exception:
            pass
    df = df.head(int(request.count or 100))

    start_date = None
    end_date = None
    try:
        if "created_at" in df.columns and not df["created_at"].dropna().empty:
            start_dt = df["created_at"].min()
            end_dt = df["created_at"].max()
            if start_dt is not None and hasattr(start_dt, "date"):
                start_date = start_dt.date().isoformat()
            if end_dt is not None and hasattr(end_dt, "date"):
                end_date = end_dt.date().isoformat()
    except Exception:
        pass

    baseline = None
    try:
        result = storage.load_analysis_result(user_id, request.app_id) or {}
        prev_insights = result.get("insights") or {}
        prev_metadata = result.get("metadata") or {}
        prev_date = prev_metadata.get("fetched_at") or ""
        if not prev_date and result.get("updated_at"):
            try:
                prev_date = datetime.utcfromtimestamp(result["updated_at"]).strftime("%Y-%m-%d")
            except Exception:
                prev_date = ""
        if prev_insights:
            baseline = {
                "date": prev_date,
                "recommendation_rate": prev_insights.get("recommendation"),
                "issue_rate": (prev_insights.get("llm") or {}).get("issue_rate"),
                "request_rate": (prev_insights.get("llm") or {}).get("feature_request_rate"),
            }
    except Exception:
        baseline = None

    export_columns = [
        "review_id", "review", "language", "created_at", "voted_up",
        "votes_up", "votes_funny", "comment_count",
        "llm_subcategories", "llm_issue_subcategories",
        "llm_request_subcategories", "llm_subcategory_evidence",
    ]
    export_columns = [col for col in export_columns if col in df.columns]
    reviews_payload = (
        json.loads(
            df[export_columns].to_json(orient="records", date_format="iso", date_unit="s")
        )
        if export_columns
        else []
    )

    widget_context: Dict[str, Any] = {
        "date_range": f"{start_date} -> {end_date}" if start_date and end_date else None,
        "baseline": baseline,
        "filters": request.filter_context if request.filter_context else None,
    }

    try:
        with llm.llm_usage_context(user_id=user_id, app_id=request.app_id, operation="health_overview"):
            result = llm.generate_health_overview(
                reviews=reviews_payload,
                game_context=game_context,
                baseline=baseline,
                widget_context=widget_context,
            )
        return SummarizeRecentReviewsResponse(
            **result,
            review_count=len(reviews_payload),
            start_date=start_date,
            end_date=end_date,
        )
    except Exception as exc:
        logger.exception("Recent reviews summarize failed: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to generate recent reviews summary.") from exc


@router.post("/summarize/news", response_model=SummarizeNewsResponse)
def summarize_news(request: SummarizeNewsRequest) -> SummarizeNewsResponse:
    user_id = "local"
    try:
        news_items = fetch_news_for_app(request.app_id, count=request.news_count, max_length=500)
    except SteamAPIError as exc:
        logger.error("Failed to fetch news for app %s: %s", request.app_id, exc)
        raise HTTPException(status_code=502, detail=f"Failed to fetch news: {str(exc)}") from exc

    if not news_items:
        return SummarizeNewsResponse(
            summary="No recent news or updates available for this game.",
            key_updates=[],
            potential_impacts=[],
            correlation_insights=None,
            news_count=0,
        )

    game_context = fetch_app_details(request.app_id)

    recent_sentiment = None
    if request.include_sentiment:
        try:
            result = storage.load_analysis_result(user_id, request.app_id)
            if result:
                insights = result.get("insights") or {}
                llm_insights = insights.get("llm") or {}
                recent_sentiment = {
                    "recommendation_rate": insights.get("recommendation"),
                    "trend": insights.get("trend_direction"),
                    "top_issues": [
                        item.get("subcategory")
                        for item in (llm_insights.get("top_issue_subcategories") or [])[:3]
                    ],
                    "top_requests": [
                        item.get("subcategory")
                        for item in (llm_insights.get("top_request_subcategories") or [])[:3]
                    ],
                }
        except Exception as exc:
            logger.warning("Failed to load sentiment data for news summary: %s", exc)

    news_dicts = [
        {
            "title": item.title,
            "contents": item.contents,
            "date": item.date,
            "feed_label": item.feed_label,
        }
        for item in news_items
    ]

    try:
        with llm.llm_usage_context(user_id=user_id, app_id=request.app_id, operation="summarize_news"):
            result = llm.summarize_news_updates(
                news_items=news_dicts,
                game_name=game_context.get("name") if game_context else None,
                game_context=game_context,
                recent_sentiment=recent_sentiment,
            )
        return SummarizeNewsResponse(
            **result,
            news_count=len(news_items),
        )
    except Exception as exc:
        logger.exception("News summarize failed: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to generate news summary.") from exc


# ---------------------------------------------------------------------------
# Progress endpoints
# ---------------------------------------------------------------------------

@router.get("/progress/{app_id}")
def classification_progress(app_id: int) -> dict:
    user_id = "local"
    progress = storage.load_progress(user_id, app_id)
    if not progress:
        result = storage.load_analysis_result(user_id, app_id)
        if result and result.get("status") == "running":
            return {
                "app_id": app_id,
                "total": 0,
                "processed": 0,
                "active": True,
                "updated_at": None,
                "phase": "fetching",
                "fetched_count": 0,
            }
        return {
            "app_id": app_id,
            "total": 0,
            "processed": 0,
            "active": False,
            "updated_at": None,
            "phase": "idle",
            "fetched_count": 0,
        }

    total = int(progress.get("total", 0))
    processed = int(progress.get("processed", 0))
    phase = progress.get("phase", "classifying")
    fetched_count = int(progress.get("fetched_count", 0))
    timestamp = progress.get("updated_at")
    updated_at = (
        datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat().replace("+00:00", "Z")
        if timestamp
        else None
    )

    if phase == "fetching":
        active = True
    elif phase == "building_insights":
        result = storage.load_analysis_result(user_id, app_id)
        if result and result.get("status") in ("completed", "failed"):
            active = False
        else:
            active = True
    else:
        active = processed < total

    return {
        "app_id": app_id,
        "total": total,
        "processed": processed,
        "active": active,
        "updated_at": updated_at,
        "phase": phase,
        "fetched_count": fetched_count,
    }


@router.get("/progress/{app_id}/stream")
async def progress_stream(app_id: int):
    user_id = "local"

    async def event_generator():
        last_processed = -1
        last_fetched = -1
        idle_count = 0
        max_idle = 200

        while True:
            try:
                progress = storage.load_progress(user_id, app_id)

                if not progress:
                    result = storage.load_analysis_result(user_id, app_id)
                    if result:
                        status = result.get("status", "unknown")
                        if status == "completed":
                            yield f"event: completed\ndata: {json.dumps({'status': 'completed'})}\n\n"
                            return
                        elif status == "failed":
                            error = result.get("error", "Analysis failed")
                            yield f"event: error\ndata: {json.dumps({'status': 'failed', 'error': error})}\n\n"
                            return
                        elif status == "running":
                            yield f"event: progress\ndata: {json.dumps({'processed': 0, 'total': 0, 'active': True, 'phase': 'fetching', 'fetched_count': 0})}\n\n"
                            idle_count += 1
                            await asyncio.sleep(1.5)
                            continue

                    yield f"event: progress\ndata: {json.dumps({'processed': 0, 'total': 0, 'active': False, 'phase': 'idle', 'fetched_count': 0})}\n\n"
                    idle_count += 1
                else:
                    total = int(progress.get("total", 0))
                    processed = int(progress.get("processed", 0))
                    phase = progress.get("phase", "classifying")
                    fetched_count = int(progress.get("fetched_count", 0))

                    if phase in ("fetching", "building_insights"):
                        active = True
                    else:
                        active = processed < total

                    yield f"event: progress\ndata: {json.dumps({'processed': processed, 'total': total, 'active': active, 'phase': phase, 'fetched_count': fetched_count})}\n\n"

                    if phase == "fetching":
                        if fetched_count == last_fetched:
                            idle_count += 1
                        else:
                            idle_count = 0
                            last_fetched = fetched_count
                    elif phase == "building_insights":
                        idle_count += 1
                    else:
                        if processed == last_processed:
                            idle_count += 1
                        else:
                            idle_count = 0
                            last_processed = processed

                    if total > 0 and (not active or processed >= total):
                        result = storage.load_analysis_result(user_id, app_id)
                        if result:
                            status = result.get("status", "unknown")
                            if status == "completed":
                                yield f"event: completed\ndata: {json.dumps({'status': 'completed'})}\n\n"
                                return
                            elif status == "failed":
                                error = result.get("error", "Analysis failed")
                                yield f"event: error\ndata: {json.dumps({'status': 'failed', 'error': error})}\n\n"
                                return

                if idle_count >= max_idle:
                    yield f"event: timeout\ndata: {json.dumps({'status': 'timeout'})}\n\n"
                    return

                await asyncio.sleep(1.5)

            except asyncio.CancelledError:
                return
            except Exception as exc:
                logger.warning("SSE progress stream error: %s", exc)
                yield f"event: error\ndata: {json.dumps({'status': 'error', 'error': str(exc)})}\n\n"
                return

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/progress/{app_id}/cancel")
def cancel_analysis(app_id: int) -> dict:
    user_id = "local"
    cancelled = storage.cancel_progress(user_id, app_id)
    if cancelled:
        logger.info(f"Analysis cancelled for app {app_id} by user {user_id}")
    return {"cancelled": cancelled, "app_id": app_id}
