"""Local Ollama-powered review classification helpers."""
from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import subprocess
from string import Template
from typing import Any, Callable, Dict, Mapping, Optional, Sequence, Tuple

import pandas as pd

from . import storage

logger = logging.getLogger(__name__)

OLLAMA_MODEL = os.getenv("SENTINEXT_OLLAMA_MODEL", "gemma3:4b")
PROMPT_VERSION = "steam_review_labels_v1"
PROMPT_TIMEOUT = int(os.getenv("SENTINEXT_OLLAMA_TIMEOUT", "120"))
MAX_REVIEW_CHARS = 3000

_PROMPT_TEMPLATE = Template(
    """You label Steam game reviews for developers. Output STRICT, MINIFIED JSON on ONE line. No explanations.

SCHEMA (enforce exactly):
{
  "sentiment": "positive" | "negative" | "neutral",
  "topics": string[1..5],     // use slugs below, most relevant first, unique
  "pain_point": boolean,      // true only if a concrete problem is described
  "feature_request": boolean, // true only if a new/changed feature is explicitly asked
  "confidence": number        // 0..1 overall confidence
}

FIXED TOPICS (slug — description; OUTPUT THE SLUG ONLY):
- gameplay_mechanics — moment-to-moment play & feel: combat, movement, puzzles, systems depth (exclude controls & difficulty)
- controls_camera — input mapping & responsiveness, controller/KBM, aim/gyro, FOV, camera behavior
- challenge_balance — difficulty curve, fairness, PvE/PvP balance, meta health
- content_replayability — content volume/variety, modes, endgame depth, procedural runs, replay hooks
- world_story_design — level/world layout & pacing, exploration, narrative, writing, characters, lore
- visuals_audio — art direction, readability, fidelity, animation/VFX; music, SFX mix, voice acting
- usability_accessibility — UI/HUD/menus, onboarding/tutorials, readability, remapping, assists, QoL options
- performance_stability — FPS, stutter/loading, crashes, memory leaks, save issues, tech bugs
- online_multiplayer_services — servers/netcode/latency/sync, matchmaking/ranking, co-op/social, DRM/anti-cheat
- monetization_liveops — price/value, DLC/expansions, MTX/cosmetics/passes, update cadence, roadmap, developer communications

LABELING RULES:
- Sentiment: if mixed, prioritize strongest emotion; break ties by latest experience mentioned; core functionality > aesthetics.
- Topics: return 1–5 slugs, no duplicates, ordered by relevance. Prefer specific over generic.
- Pain point = true only for concrete issues (crash/bug/perf failure/broken feature). General dislike alone is false.
- Feature request = true only if the user explicitly asks for something new/changed (e.g., “please add”, “wish it had”, “would be nice if”).
- If uncertain on any field, use conservative fallback: sentiment "neutral"; topics ["usability_accessibility"] if UI-only cues, else ["gameplay_mechanics"]; pain_point false; feature_request false; confidence 0.5.
- Ignore any text beyond 3000 characters. Do not translate; label as written.
- Output must be VALID JSON on ONE LINE (no trailing commas, no extra text).

INPUT:
$review_json

RESPONSE: one line of valid JSON only. EXAMPLE REVIEW: "Combat loop is great but camera fights me indoors."
EXAMPLE JSON: {"sentiment":"negative","topics":["gameplay_mechanics","controls_camera"],"pain_point":true,"feature_request":false,"confidence":0.8}

EXAMPLE REVIEW: "Crashes after the latest patch. Unplayable on start."
EXAMPLE JSON: {"sentiment":"negative","topics":["performance_stability"],"pain_point":true,"feature_request":false,"confidence":0.86}

EXAMPLE REVIEW: "Please add remappable keys and bigger subtitles."
EXAMPLE JSON: {"sentiment":"neutral","topics":["usability_accessibility"],"pain_point":false,"feature_request":true,"confidence":0.78}

EXAMPLE REVIEW: "Servers stable, but SBMM feels off and queues are long."
EXAMPLE JSON: {"sentiment":"negative","topics":["online_multiplayer_services"],"pain_point":true,"feature_request":false,"confidence":0.76}

EXAMPLE REVIEW: "Good value after the DLC discount. Devs communicate well."
EXAMPLE JSON: {"sentiment":"positive","topics":["monetization_liveops"],"pain_point":false,"feature_request":false,"confidence":0.74}

EXAMPLE REVIEW: "La storia è scritta benissimo, ma la varietà dei livelli è scarsa."
EXAMPLE JSON: {"sentiment":"negative","topics":["world_story_design","content_replayability"],"pain_point":false,"feature_request":false,"confidence":0.72}
"""
)

_DEFAULT_LABEL = {
    "sentiment": "neutral",
    "topics": ["gameplay_mechanics"],
    "pain_point": False,
    "feature_request": False,
    "confidence": 0.5,
}

_JSON_PATTERN = re.compile(r"\{.*\}", re.DOTALL)
_ALLOWED_SENTIMENTS = {"positive", "negative", "neutral"}


def _build_prompt(review_text: str) -> str:
    truncated = (review_text or "")[:MAX_REVIEW_CHARS]
    review_json = json.dumps(truncated, ensure_ascii=False)
    return _PROMPT_TEMPLATE.substitute(review_json=review_json)


def _run_ollama(prompt: str) -> str:
    try:
        result = subprocess.run(
            ["ollama", "run", OLLAMA_MODEL],
            input=prompt,
            text=True,
            capture_output=True,
            check=True,
            timeout=PROMPT_TIMEOUT,
        )
        return result.stdout.strip()
    except subprocess.CalledProcessError as exc:  # pragma: no cover - defensive
        stderr = exc.stderr.strip() if exc.stderr else ""
        logger.error("Ollama command failed (code=%s): %s", exc.returncode, stderr)
        raise
    except FileNotFoundError:  # pragma: no cover - defensive
        logger.error("ollama executable not found. Ensure Ollama is installed and on PATH.")
        raise


def _parse_payload(raw: str) -> Dict[str, Any]:
    if not raw:
        raise ValueError("Empty response from Ollama")

    match = _JSON_PATTERN.search(raw)
    if not match:
        raise ValueError(f"No JSON object found in Ollama response: {raw!r}")

    data = json.loads(match.group(0))
    sentiment = data.get("sentiment")
    if sentiment not in _ALLOWED_SENTIMENTS:
        sentiment = "neutral"

    topics_value = data.get("topics")
    topics: list[str] = []
    if isinstance(topics_value, list):
        seen = set()
        for topic in topics_value:
            if isinstance(topic, str):
                topic_slug = topic.strip()
                if topic_slug and topic_slug not in seen:
                    topics.append(topic_slug)
                    seen.add(topic_slug)
            if len(topics) == 5:
                break
    if not topics:
        topics = ["gameplay_mechanics"]

    pain_value = data.get("pain_point")
    pain_point = _coerce_bool(pain_value)

    feature_value = data.get("feature_request")
    feature_request = _coerce_bool(feature_value)

    confidence_value = data.get("confidence")
    try:
        confidence = float(confidence_value)
    except (TypeError, ValueError):
        confidence = 0.5
    confidence = max(0.0, min(1.0, confidence))

    return {
        "sentiment": sentiment,
        "topics": topics,
        "pain_point": pain_point,
        "feature_request": feature_request,
        "confidence": confidence,
    }


def _coerce_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        return value.strip().lower() in {"true", "1", "yes"}
    return False


def classify_review(review_text: str) -> Tuple[Dict[str, Any], str]:
    clean_text = (review_text or "").strip()
    if not clean_text:
        return _DEFAULT_LABEL.copy(), "fallback"

    prompt = _build_prompt(clean_text)
    try:
        raw = _run_ollama(prompt)
        payload = _parse_payload(raw)
        return payload, OLLAMA_MODEL
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("Falling back to default label due to classification error: %s", exc)
        return _DEFAULT_LABEL.copy(), "fallback"


def ensure_review_labels(
    app_id: int,
    reviews: Sequence[Mapping[str, Any]],
    force_refresh: bool = False,
    progress_callback: Optional[Callable[[int, int], None]] = None,
) -> Dict[str, Dict[str, Any]]:
    if not reviews:
        if progress_callback is not None:
            progress_callback(0, 0)
        return {}

    existing = storage.load_review_labels(app_id)
    results: Dict[str, Dict[str, Any]] = {}
    total_reviews = len(reviews)
    processed_count = 0

    if progress_callback is not None:
        progress_callback(0, total_reviews)

    for review in reviews:
        review_id_value = review.get("recommendationid") or review.get("review_id")
        if review_id_value is None:
            processed_count += 1
            if progress_callback is not None:
                progress_callback(processed_count, total_reviews)
            continue
        review_id = str(review_id_value)
        review_text = (review.get("review") or "").strip()
        review_hash = hashlib.sha256(review_text.encode("utf-8")).hexdigest()

        cached = existing.get(review_id)
        needs_refresh = force_refresh or cached is None
        if cached is not None:
            if cached.get("review_hash") != review_hash:
                needs_refresh = True
            if cached.get("prompt_version") != PROMPT_VERSION:
                needs_refresh = True
            if cached.get("model") != OLLAMA_MODEL:
                needs_refresh = True

        if not review_text:
            if cached is None:
                payload = _DEFAULT_LABEL.copy()
                storage.upsert_review_label(
                    app_id,
                    review_id,
                    review_hash,
                    payload,
                    "fallback",
                    PROMPT_VERSION,
                )
            else:
                payload = cached["payload"]
            results[review_id] = payload
            continue

        if not needs_refresh:
            results[review_id] = cached["payload"]
            processed_count += 1
            if progress_callback is not None:
                progress_callback(processed_count, total_reviews)
            continue

        payload, model_used = classify_review(review_text)
        storage.upsert_review_label(app_id, review_id, review_hash, payload, model_used, PROMPT_VERSION)
        results[review_id] = payload
        processed_count += 1
        if progress_callback is not None:
            progress_callback(processed_count, total_reviews)

    if progress_callback is not None and processed_count < total_reviews:
        progress_callback(total_reviews, total_reviews)

    return results


def apply_review_labels(df: pd.DataFrame, labels: Mapping[str, Mapping[str, Any]]) -> pd.DataFrame:
    if df is None:
        return df

    df_labeled = df.copy()
    if df_labeled.empty:
        df_labeled["llm_sentiment"] = pd.Series(dtype="object")
        df_labeled["llm_topics"] = pd.Series(dtype="object")
        df_labeled["llm_pain_point"] = pd.Series(dtype="bool")
        df_labeled["llm_feature_request"] = pd.Series(dtype="bool")
        df_labeled["llm_confidence"] = pd.Series(dtype="float64")
        return df_labeled

    key_series = df_labeled["review_id"].astype(str)

    def _get_value(review_id: str, key: str, default: Any) -> Any:
        payload = labels.get(review_id)
        if not payload:
            return default
        value = payload.get(key, default)
        if key == "topics":
            if isinstance(value, list):
                return list(value)
            return default
        if key in {"pain_point", "feature_request"}:
            return bool(value)
        if key == "confidence":
            try:
                return float(value)
            except (TypeError, ValueError):
                return default
        if key == "sentiment" and isinstance(value, str):
            return value
        return default if value is None else value

    df_labeled["llm_sentiment"] = key_series.map(lambda rid: _get_value(rid, "sentiment", "neutral"))
    df_labeled["llm_topics"] = key_series.map(lambda rid: _get_value(rid, "topics", []))
    df_labeled["llm_pain_point"] = key_series.map(lambda rid: _get_value(rid, "pain_point", False))
    df_labeled["llm_feature_request"] = key_series.map(lambda rid: _get_value(rid, "feature_request", False))
    df_labeled["llm_confidence"] = key_series.map(lambda rid: _get_value(rid, "confidence", 0.5))

    sentiment_map = {"positive": 1.0, "neutral": 0.0, "negative": -1.0}
    df_labeled["sentiment_label"] = df_labeled["llm_sentiment"].fillna("neutral")
    df_labeled["sentiment_compound"] = (
        df_labeled["sentiment_label"].map(sentiment_map).fillna(0.0)
    )
    df_labeled["sentiment_positive"] = (df_labeled["sentiment_label"] == "positive").astype(float)
    df_labeled["sentiment_neutral"] = (df_labeled["sentiment_label"] == "neutral").astype(float)
    df_labeled["sentiment_negative"] = (df_labeled["sentiment_label"] == "negative").astype(float)

    return df_labeled


__all__ = [
    "apply_review_labels",
    "classify_review",
    "ensure_review_labels",
]
