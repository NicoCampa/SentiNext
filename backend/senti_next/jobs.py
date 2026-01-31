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
            storage.save_analysis_result(
                user_id, app_id, metadata_dict, None, [],
                status="completed", run_id=run_id, snapshot_hash=snapshot_hash, context_hash=context_hash
            )
            if job_id:
                storage.update_job_registry(job_id, status="completed")
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
            storage.update_progress(user_id, app_id, total_reviews, total_reviews)
            storage.clear_progress(user_id, app_id)
