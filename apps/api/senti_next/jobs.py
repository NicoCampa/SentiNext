"""Background job definitions for RQ worker."""
from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from . import storage
from . import llm
from .insights import prepare_insights
from .analysis import build_reviews_dataframe

logger = logging.getLogger(__name__)

SAMPLE_LIMIT = 1000

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
    "llm_main_category",
    "llm_subcategory",
    "llm_subcategories",
    "llm_issue_subcategories",
    "llm_request_subcategories",
    "llm_subcategory_evidence",
    "llm_has_issue",
    "llm_has_request",
]


def run_analysis_job(
    user_id: str,
    app_id: int,
    all_reviews: List[dict],
    metadata_dict: Dict[str, Any],
    game_context: Optional[Dict[str, Any]],
    job_id: Optional[str] = None,
) -> None:
    """Run the full analysis pipeline as a background job.

    This function is designed to be called by RQ worker or directly
    when Redis is not available (fallback mode).
    """
    run_id = hashlib.sha256(f"{app_id}-{datetime.utcnow().isoformat()}".encode("utf-8")).hexdigest()[:16]
    snapshot_hash = hashlib.sha256(json.dumps(all_reviews, sort_keys=True, default=str).encode("utf-8")).hexdigest()[:16]
    context_hash = hashlib.sha256(json.dumps(game_context or {}, sort_keys=True, default=str).encode("utf-8")).hexdigest()[:16]

    # Store a fingerprint of the review IDs used for this analysis so the
    # dashboard can detect when the underlying review pool has changed
    # (e.g. another user refreshed the same game).
    review_fingerprint = storage.get_reviews_fingerprint(app_id)
    if review_fingerprint:
        metadata_dict["review_fingerprint"] = review_fingerprint

    total_reviews = len(all_reviews)
    progress_active = total_reviews > 0

    # Update job registry if we have a job_id
    if job_id:
        storage.update_job_registry(job_id, status="running")

    if progress_active:
        storage.reset_progress(user_id, app_id, total_reviews)

        def _progress_callback(processed: int, total: int) -> None:
            try:
                storage.update_progress(user_id, app_id, processed, total)
            except Exception as exc:
                logger.warning("Progress update failed: %s", exc)
    else:
        storage.clear_progress(user_id, app_id)

    analysis_failed = False

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
            storage.save_analysis_result(
                user_id, app_id, metadata_dict, None, [],
                status="completed", run_id=run_id, snapshot_hash=snapshot_hash, context_hash=context_hash
            )
            if job_id:
                storage.update_job_registry(job_id, status="completed")
            return

        # Signal phase transition so the frontend shows "Building insights"
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

        # Auto-generate health overview for the persistent dashboard card
        try:
            # Load *previous* analysis result as baseline for trend comparison
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
            metadata=metadata_dict,
            insights=insights,
            reviews=reviews_payload,
            status="completed",
            run_id=run_id,
            snapshot_hash=snapshot_hash,
            context_hash=context_hash,
        )
        if job_id:
            storage.update_job_registry(job_id, status="completed")

    except Exception as exc:
        analysis_failed = True
        logger.exception("Analysis job failed: %s", exc)
        storage.save_analysis_result(
            user_id=user_id,
            app_id=app_id,
            metadata=metadata_dict,
            insights=None,
            reviews=[],
            status="failed",
            error=str(exc),
            run_id=run_id,
            snapshot_hash=snapshot_hash,
            context_hash=context_hash,
        )
        if job_id:
            storage.update_job_registry(job_id, status="failed", error=str(exc))
        raise

    finally:
        if progress_active:
            # Mark progress as fully complete; do NOT clear_progress() here
            # because the SSE stream / polling endpoint may still need to see
            # the final state.  The progress row is overwritten on the next
            # analysis via reset_progress().
            storage.update_progress(user_id, app_id, total_reviews, total_reviews)
            # Reset phase from "building_insights" back to "classifying" so
            # the SSE stream can detect completion (building_insights forces
            # active=true which prevents the SSE completion check).
            storage.update_progress_phase(user_id, app_id, "classifying")

