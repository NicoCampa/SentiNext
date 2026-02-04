"""Scheduled jobs for automated tasks.

This module contains jobs that run on a schedule, such as daily
favorites refresh for auto-fetching new reviews.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from . import storage
from . import credits
from . import llm
from .steam_api import fetch_reviews
from .insights import prepare_insights
from .analysis import build_reviews_dataframe
from .jobs import REVIEW_EXPORT_COLUMNS, SAMPLE_LIMIT

logger = logging.getLogger(__name__)

# Days to look back for new reviews in auto-refresh
AUTO_REFRESH_DAY_RANGE = 7


def run_daily_favorites_refresh() -> Dict[str, Any]:
    """Daily job to refresh all favorite games across all users.

    Runs at 4 AM UTC daily. For each favorite game:
    1. Fetch reviews from the last 7 days
    2. Run LLM classification on new reviews
    3. Update stored analysis
    4. Deduct credits (full price - 1 credit per new review)
    5. Skip users with insufficient credits

    Returns a summary of the refresh operation.
    """
    logger.info("Starting daily favorites refresh job")

    # Load all favorite games across all users
    favorites = storage.load_all_favorite_games()

    if not favorites:
        logger.info("No favorite games found, skipping refresh")
        return {
            "status": "completed",
            "total_games": 0,
            "processed": 0,
            "skipped": 0,
            "failed": 0,
        }

    logger.info("Found %d favorite games to refresh", len(favorites))

    results = {
        "status": "completed",
        "total_games": len(favorites),
        "processed": 0,
        "skipped": 0,
        "failed": 0,
        "details": [],
    }

    for favorite in favorites:
        user_id = favorite["user_id"]
        app_id = favorite["app_id"]
        game_name = favorite.get("name", f"App {app_id}")

        try:
            result = _refresh_single_favorite(user_id, app_id, game_name)
            results["details"].append(result)

            if result["status"] == "completed":
                results["processed"] += 1
            elif result["status"] == "skipped":
                results["skipped"] += 1
            else:
                results["failed"] += 1

        except Exception as exc:
            logger.exception("Failed to refresh favorite game %d for user %s: %s", app_id, user_id, exc)
            results["failed"] += 1
            results["details"].append({
                "user_id": user_id,
                "app_id": app_id,
                "game_name": game_name,
                "status": "failed",
                "error": str(exc),
            })

    logger.info(
        "Daily favorites refresh completed: %d processed, %d skipped, %d failed",
        results["processed"],
        results["skipped"],
        results["failed"],
    )

    return results


def _refresh_single_favorite(user_id: str, app_id: int, game_name: str) -> Dict[str, Any]:
    """Refresh a single favorite game for a user.

    Returns a dict with status and details of the operation.
    """
    # Create log entry
    log_id = storage.log_auto_refresh(
        user_id=user_id,
        app_id=app_id,
        status="pending",
    )

    try:
        # Early check: skip if user is already blocked
        credit_status = credits.get_credit_status(user_id)
        if credit_status.get("blocked"):
            logger.info("Skipping refresh for user %s (app %d): credit limit blocked", user_id, app_id)
            storage.update_auto_refresh_log(
                log_id=log_id,
                status="skipped",
                error="Credit limit exceeded",
            )
            return {
                "user_id": user_id,
                "app_id": app_id,
                "game_name": game_name,
                "status": "skipped",
                "reason": "credit_limit_blocked",
            }

        # Fetch recent reviews (last 7 days)
        logger.info("Fetching recent reviews for app %d (user %s)", app_id, user_id)
        reviews = fetch_reviews(
            app_id=app_id,
            count=500,  # Reasonable limit for daily refresh
            language="all",
            filter_type="recent",
            day_range=AUTO_REFRESH_DAY_RANGE,
        )

        if not reviews:
            logger.info("No new reviews found for app %d", app_id)
            storage.update_auto_refresh_log(
                log_id=log_id,
                status="completed",
                reviews_fetched=0,
                credits_used=0,
            )
            return {
                "user_id": user_id,
                "app_id": app_id,
                "game_name": game_name,
                "status": "completed",
                "reviews_fetched": 0,
                "credits_used": 0,
            }

        # Persist reviews to database
        storage.upsert_reviews(app_id, reviews)

        # Get estimate of how many reviews need LLM processing
        review_estimate = llm.estimate_review_labeling(app_id, reviews)
        llm_review_count = int(review_estimate.get("llm_reviews", 0) or 0)
        cached_review_count = int(review_estimate.get("cached_reviews", 0) or 0)

        # Calculate credit cost
        credit_cost = credits.estimate_analysis_cost(llm_review_count, cached_review_count)

        # Check if user can afford this (respect soft limit + bonus credits)
        can_proceed, credit_message, _ = credits.check_credits_available(user_id, credit_cost)
        if not can_proceed:
            logger.info(
                "Skipping refresh for user %s (app %d): %s",
                user_id, app_id, credit_message
            )
            storage.update_auto_refresh_log(
                log_id=log_id,
                status="skipped",
                reviews_fetched=len(reviews),
                error=credit_message,
            )
            return {
                "user_id": user_id,
                "app_id": app_id,
                "game_name": game_name,
                "status": "skipped",
                "reason": "insufficient_credits",
                "reviews_fetched": len(reviews),
                "estimated_cost": credit_cost,
            }

        # Run LLM classification
        logger.info("Running LLM classification for %d reviews (app %d)", len(reviews), app_id)
        storage.update_auto_refresh_log(log_id=log_id, status="processing")

        with llm.llm_usage_context(user_id=user_id, app_id=app_id, operation="auto_refresh"):
            llm_labels = llm.ensure_review_labels(
                app_id,
                reviews,
                progress_callback=None,
                game_context=None,
            )

        # Note: Credit deduction removed - now using game-based billing

        # Build insights
        df = build_reviews_dataframe(reviews)
        df = llm.apply_review_labels(df, llm_labels)

        if df is None or df.empty:
            storage.update_auto_refresh_log(
                log_id=log_id,
                status="completed",
                reviews_fetched=len(reviews),
                credits_used=credit_cost,
            )
            return {
                "user_id": user_id,
                "app_id": app_id,
                "game_name": game_name,
                "status": "completed",
                "reviews_fetched": len(reviews),
                "credits_used": credit_cost,
            }

        insights = prepare_insights(df)

        # Build sample reviews for storage
        export_columns = [col for col in REVIEW_EXPORT_COLUMNS if col in df.columns]
        if export_columns:
            import json
            sample_limit = min(SAMPLE_LIMIT, df.shape[0])
            sample_reviews = json.loads(
                df[export_columns]
                .head(sample_limit)
                .to_json(orient="records", date_format="iso", date_unit="s")
            )
        else:
            sample_reviews = []

        # Update the starred game with new insights
        # First load existing metadata
        existing_games = storage.load_starred_games(user_id)
        existing_game = next((g for g in existing_games if g["app_id"] == app_id), None)

        if existing_game:
            metadata = existing_game.get("metadata", {})
            metadata["fetched_at"] = datetime.now(timezone.utc).isoformat() + "Z"
            metadata["retrieved"] = len(reviews)

            storage.save_starred_game(
                user_id=user_id,
                app_id=app_id,
                name=game_name,
                metadata=metadata,
                insights=insights,
                sample=sample_reviews,
                genres=existing_game.get("genres", []),
                categories=existing_game.get("categories", []),
            )

        # Update log entry
        storage.update_auto_refresh_log(
            log_id=log_id,
            status="completed",
            reviews_fetched=len(reviews),
            credits_used=credit_cost,
        )

        logger.info(
            "Successfully refreshed app %d for user %s: %d reviews, %d credits",
            app_id, user_id, len(reviews), credit_cost
        )

        return {
            "user_id": user_id,
            "app_id": app_id,
            "game_name": game_name,
            "status": "completed",
            "reviews_fetched": len(reviews),
            "credits_used": credit_cost,
            "llm_reviews": llm_review_count,
            "cached_reviews": cached_review_count,
        }

    except Exception as exc:
        logger.exception("Error refreshing app %d for user %s: %s", app_id, user_id, exc)
        storage.update_auto_refresh_log(
            log_id=log_id,
            status="failed",
            error=str(exc),
        )
        raise
