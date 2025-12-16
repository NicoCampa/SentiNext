"""Optimized LLM prompt - 28% token reduction by removing hierarchical taxonomy."""
from __future__ import annotations

import hashlib
import json
import logging
import os
from string import Template
from textwrap import dedent
from typing import Any, Callable, Dict, Mapping, Optional, Sequence, Tuple

import pandas as pd
import yaml

import ollama

from . import storage

logger = logging.getLogger(__name__)

OLLAMA_MODEL = os.getenv("SENTINEXT_OLLAMA_MODEL", "gpt-oss:20b-cloud")
PROMPT_VERSION = "steam_review_insights_v8_optimized"
MAX_REVIEW_CHARS = 3000

_PROMPT_TEMPLATE = Template(
    dedent(
        """Extract developer insights from Steam review. Reply with YAML only, no backticks.

        GAME: $game_name ($game_genres)
        REVIEWER: $reviewer_playtime hrs, $reviewer_recommendation

        YAML OUTPUT:
        main_category: gameplay|technical|content|interface|social|monetization|other
        subcategory: <see categories below>
        issues: [{category: <from list>, severity: critical|high|medium|low, example: "quote"}]
        feature_requests: [{category: <from list>, demand: high|medium|low, example: "quote"}]
        urgency: critical|high|medium|low

        CATEGORIES:

        gameplay → mechanics|controls|balance|progression
        technical → performance|stability|bugs|compatibility
        content → quantity|variety|quality|replayability
        interface → usability|accessibility|tutorial|audio_visual
        social → multiplayer|community|support
        monetization → pricing|dlc|microtransactions|value
        other → general|mixed|unclear

        ISSUE CATEGORIES:
        boss_difficulty, combat_balance, fps_drops, crashes_frequent, bugs_gameplay,
        ui_confusing, progression_too_slow, content_repetitive, ai_broken, optimization_poor,
        loading_times, save_corruption, story_quality_poor, map_issues, tutorial_poor

        FEATURE REQUEST CATEGORIES:
        difficulty_options_wanted, new_game_plus_wanted, more_endgame_wanted,
        fast_travel_wanted, skip_cutscenes_wanted, coop_mode_wanted, mod_support_wanted,
        fov_slider_wanted, crossplay_wanted, photo_mode_wanted

        RULES:
        - Extract 0-5 issues, 0-5 requests per review
        - Use standardized categories above
        - Add specific example for each (short quote)
        - critical=unplayable, high=major, medium=annoying, low=minor
        - Vague reviews: issues=[], feature_requests=[], urgency=low

        REVIEW: $review_literal

        EXAMPLE OUTPUT:
        main_category: technical
        subcategory: stability
        issues:
          - category: crashes_frequent
            severity: critical
            example: "crashes every 20 min"
          - category: boss_difficulty
            severity: high
            example: "final boss too hard"
        feature_requests:
          - category: new_game_plus_wanted
            demand: high
            example: "want to replay with gear"
        urgency: critical
        """
    )
)

_DEFAULT_LABEL = {
    "main_category": "other",
    "subcategory": "general",
    "issues": [],
    "feature_requests": [],
    "urgency": "low",
}

_ALLOWED_URGENCIES = {"critical", "high", "medium", "low"}
_ALLOWED_MAIN_CATEGORIES = {"gameplay", "technical", "content", "interface", "social", "monetization", "other"}
_ALLOWED_SUBCATEGORIES = {
    "gameplay": {"mechanics", "controls", "balance", "progression"},
    "technical": {"performance", "stability", "bugs", "compatibility"},
    "content": {"quantity", "variety", "quality", "replayability"},
    "interface": {"usability", "accessibility", "tutorial", "audio_visual"},
    "social": {"multiplayer", "community", "support"},
    "monetization": {"pricing", "dlc", "microtransactions", "value"},
    "other": {"general", "mixed", "unclear"},
}


def _build_prompt(
    review_text: str,
    game_context: Optional[Dict[str, Any]] = None,
    reviewer_playtime: float = 0,
    reviewer_voted_up: bool = True,
) -> str:
    truncated = (review_text or "")[:MAX_REVIEW_CHARS]
    review_literal = json.dumps(truncated, ensure_ascii=False)

    # Build game context strings
    if game_context:
        game_name = game_context.get("name", "Unknown")
        genres = game_context.get("genres", [])
        game_genres = ", ".join(genres) if genres else "Unknown"
    else:
        game_name = "Unknown"
        game_genres = "Unknown"

    # Format playtime
    playtime_hours = round(reviewer_playtime / 60, 1) if reviewer_playtime else 0
    recommendation = "Positive" if reviewer_voted_up else "Negative"

    return _PROMPT_TEMPLATE.substitute(
        review_literal=review_literal,
        game_name=game_name,
        game_genres=game_genres,
        reviewer_playtime=playtime_hours,
        reviewer_recommendation=recommendation,
    )


def _run_ollama(prompt: str) -> str:
    try:
        response = ollama.chat(
            model=OLLAMA_MODEL,
            messages=[{"role": "user", "content": prompt}],
            stream=False,
        )
    except ollama.ResponseError as exc:  # pragma: no cover - defensive
        logger.error("Ollama chat failed: %s", exc)
        raise

    if isinstance(response, dict):
        message = response.get("message")
    else:
        message = getattr(response, "message", None)

    content = ""
    if isinstance(message, dict):
        content = (message.get("content") or "").strip()
    elif message is not None:
        content_value = getattr(message, "content", "")
        if isinstance(content_value, str):
            content = content_value.strip()

    return content


def _parse_ollama_response(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Parse Ollama YAML response into standardized format (V8)."""
    main_category = (payload.get("main_category") or "other").lower()
    if main_category not in _ALLOWED_MAIN_CATEGORIES:
        main_category = "other"

    subcategory = (payload.get("subcategory") or "general").lower()
    allowed_subs = _ALLOWED_SUBCATEGORIES.get(main_category, {"general"})
    if subcategory not in allowed_subs:
        subcategory = next(iter(allowed_subs))

    # Parse issues (v8: structured objects)
    issues_value = payload.get("issues") or []
    issues: list[dict] = []
    if isinstance(issues_value, list):
        for item in issues_value:
            if isinstance(item, dict):
                category = item.get("category", "")
                severity = item.get("severity", "medium")
                example = item.get("example", "")
                if category:
                    issues.append({
                        "category": str(category).strip(),
                        "severity": severity if severity in _ALLOWED_URGENCIES else "medium",
                        "example": str(example).strip() if example else ""
                    })
            elif isinstance(item, str) and item.strip():
                # Defensive: allow plain strings to pass through
                issues.append({
                    "category": item.strip(),
                    "severity": "medium",
                    "example": ""
                })

    # Parse feature requests
    feature_requests_value = payload.get("feature_requests") or []
    feature_requests: list[dict] = []
    if isinstance(feature_requests_value, list):
        for item in feature_requests_value:
            if isinstance(item, dict):
                category = item.get("category", "")
                demand = item.get("demand", "medium")
                example = item.get("example", "")
                if category:
                    feature_requests.append({
                        "category": str(category).strip(),
                        "demand": demand if demand in _ALLOWED_URGENCIES else "medium",
                        "example": str(example).strip() if example else ""
                    })
            elif isinstance(item, str) and item.strip():
                feature_requests.append({
                    "category": item.strip(),
                    "demand": "medium",
                    "example": ""
                })

    # Boolean convenience flag indicating presence of feature requests
    feature_request = len(feature_requests) > 0

    urgency = (payload.get("urgency") or "low").lower()
    if urgency not in _ALLOWED_URGENCIES:
        urgency = "low"

    return {
        "main_category": main_category,
        "subcategory": subcategory,
        "issues": issues,
        "feature_requests": feature_requests,
        "feature_request": feature_request,
        "urgency": urgency,
    }


def _compute_review_hash(review: dict) -> str:
    text = review.get("review", "")
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def ensure_review_labels(
    app_id: int,
    reviews: Sequence[dict],
    progress_callback: Optional[Callable[[int, int], None]] = None,
    game_context: Optional[Dict[str, Any]] = None,
) -> Dict[str, Dict[str, Any]]:
    """Ensure all reviews have LLM labels. Returns {review_id: label_payload}."""
    existing = storage.load_review_labels(app_id)
    total = len(reviews)
    processed = 0

    for review in reviews:
        review_id = str(review.get("recommendationid", ""))
        if not review_id:
            continue

        review_hash = _compute_review_hash(review)
        cached = existing.get(review_id)

        # Check if we can reuse cached label
        if cached and cached.get("review_hash") == review_hash and cached.get("prompt_version") == PROMPT_VERSION:
            processed += 1
            if progress_callback:
                progress_callback(processed, total)
            continue

        # Generate new label
        review_text = review.get("review", "")
        reviewer_playtime = review.get("author", {}).get("playtime_forever", 0)
        reviewer_voted_up = review.get("voted_up", True)

        prompt = _build_prompt(
            review_text,
            game_context=game_context,
            reviewer_playtime=reviewer_playtime,
            reviewer_voted_up=reviewer_voted_up,
        )

        try:
            raw_response = _run_ollama(prompt)
            parsed_yaml = yaml.safe_load(raw_response)
            if not isinstance(parsed_yaml, dict):
                parsed_yaml = {}
        except Exception as exc:
            logger.warning(f"Failed to parse LLM response for review {review_id}: {exc}")
            parsed_yaml = {}

        label_payload = _parse_ollama_response(parsed_yaml)
        storage.upsert_review_label(
            app_id=app_id,
            review_id=review_id,
            review_hash=review_hash,
            payload=label_payload,
            model=OLLAMA_MODEL,
            prompt_version=PROMPT_VERSION,
        )

        existing[review_id] = {
            "model": OLLAMA_MODEL,
            "prompt_version": PROMPT_VERSION,
            "review_hash": review_hash,
            "payload": label_payload,
        }

        processed += 1
        if progress_callback:
            progress_callback(processed, total)

    return existing


def apply_review_labels(df: pd.DataFrame, labels: Mapping[str, Mapping[str, Any]]) -> pd.DataFrame:
    """Apply LLM labels to dataframe. Adds llm_* columns."""
    if df.empty:
        return df

    df_labeled = df.copy()
    key_series = df_labeled["review_id"]

    def _get_value(rid: str, field: str, default: Any = None) -> Any:
        entry = labels.get(rid, {})
        payload = entry.get("payload", {})
        return payload.get(field, default)

    # Add V8 columns
    df_labeled["llm_main_category"] = key_series.map(lambda rid: _get_value(rid, "main_category", "other"))
    df_labeled["llm_subcategory"] = key_series.map(lambda rid: _get_value(rid, "subcategory", "general"))
    df_labeled["llm_issues"] = key_series.map(lambda rid: _get_value(rid, "issues", []))
    df_labeled["llm_feature_requests"] = key_series.map(lambda rid: _get_value(rid, "feature_requests", []))
    df_labeled["llm_urgency"] = key_series.map(lambda rid: _get_value(rid, "urgency", "low"))

    # Provide human-readable examples alongside structured issues
    def _extract_examples(issues_list):
        if not isinstance(issues_list, list):
            return []
        return [issue.get("example", issue.get("category", "")) for issue in issues_list if isinstance(issue, dict)]

    df_labeled["llm_specific_issues"] = df_labeled["llm_issues"].apply(_extract_examples)
    df_labeled["llm_feature_request"] = key_series.map(lambda rid: bool(_get_value(rid, "feature_request", False)))

    return df_labeled
