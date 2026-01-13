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
PROMPT_VERSION = "steam_review_insights_v10_subcategory_only_opt"
MAX_REVIEW_CHARS = 3000

_PROMPT_TEMPLATE = Template(
    dedent(
        """Extract developer insights from Steam review. Reply with YAML only, no backticks.

        GAME: $game_name ($game_genres)
        REVIEWER: $reviewer_playtime hrs, $reviewer_recommendation

        YAML OUTPUT:
        main_category: gameplay|technical|content|interface|social|monetization|other
        subcategory: <primary subcategory for main_category>
        subcategories: [list of "<main>/<sub>" strings]
        issue_subcategories: [subset of subcategories with problems]
        request_subcategories: [subset of subcategories with explicit requests]
        evidence: { "<main>/<sub>": ["short quote from review"] }

        CATEGORIES:

        gameplay → mechanics|controls|balance|progression
        technical → performance|stability|bugs|compatibility
        content → quantity|variety|quality|replayability
        interface → usability|accessibility|tutorial|audio_visual
        social → multiplayer|community|support
        monetization → pricing|dlc|microtransactions|value
        other → general|mixed|unclear

        RULES:
        - Add 1-6 subcategories using "<main>/<sub>" format
        - issue_subcategories and request_subcategories must be subsets of subcategories
        - Provide at least one short evidence snippet per subcategory
        - Vague reviews: main_category=other, subcategory=general, subcategories=["other/general"],
          issue_subcategories=[], request_subcategories=[], evidence={"other/general":["short quote"]}

        REVIEW: $review_literal

        EXAMPLE OUTPUT:
        main_category: technical
        subcategory: stability
        subcategories:
          - technical/stability
          - technical/performance
        issue_subcategories:
          - technical/stability
        request_subcategories:
          - technical/performance
        evidence:
          technical/stability:
            - "crashes every 20 min"
          technical/performance:
            - "need a performance mode"
        """
    )
)

_DEFAULT_LABEL = {
    "main_category": "other",
    "subcategory": "general",
    "subcategories": ["other/general"],
    "issue_subcategories": [],
    "request_subcategories": [],
    "evidence": {},
}
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
_ALLOWED_SUBCATEGORY_KEYS = {
    f"{main}/{sub}" for main, subs in _ALLOWED_SUBCATEGORIES.items() for sub in subs
}
_SUBCATEGORY_SEPARATORS = ("/", ":", ".")
MAX_EVIDENCE_SNIPPET_CHARS = 160


def _clean_snippet(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).replace("\n", " ").replace("\r", " ").strip()
    if not text:
        return ""
    if len(text) > MAX_EVIDENCE_SNIPPET_CHARS:
        return text[: MAX_EVIDENCE_SNIPPET_CHARS - 3].rstrip() + "..."
    return text


def _normalize_subcategory_value(value: Any, fallback_main: Optional[str] = None) -> Optional[str]:
    if isinstance(value, dict):
        main = value.get("main_category") or value.get("main")
        sub = value.get("subcategory") or value.get("sub")
        if main and sub:
            value = f"{main}/{sub}"
        else:
            return None
    if not isinstance(value, str):
        return None
    raw = value.strip().lower()
    if not raw:
        return None
    main = ""
    sub = ""
    for sep in _SUBCATEGORY_SEPARATORS:
        if sep in raw:
            main, sub = raw.split(sep, 1)
            break
    if not main or not sub:
        if fallback_main:
            main = fallback_main
            sub = raw
        else:
            return None
    main = main.strip()
    sub = sub.strip()
    if main not in _ALLOWED_SUBCATEGORIES:
        return None
    if sub not in _ALLOWED_SUBCATEGORIES[main]:
        return None
    return f"{main}/{sub}"


def _parse_subcategory_list(value: Any, fallback_main: Optional[str] = None) -> list[str]:
    results: list[str] = []
    if isinstance(value, dict):
        for main_key, subs in value.items():
            if not isinstance(subs, list):
                continue
            for sub in subs:
                normalized = _normalize_subcategory_value(f"{main_key}/{sub}")
                if normalized and normalized not in results:
                    results.append(normalized)
        return results
    if isinstance(value, list):
        items = value
    elif isinstance(value, str):
        items = [value]
    else:
        return results
    for item in items:
        normalized = _normalize_subcategory_value(item, fallback_main=fallback_main)
        if normalized and normalized not in results:
            results.append(normalized)
    return results


def _parse_evidence(value: Any, allowed_subcategories: list[str]) -> dict[str, list[str]]:
    if not isinstance(value, dict):
        return {}
    allowed = set(allowed_subcategories)
    evidence: dict[str, list[str]] = {}
    for raw_key, raw_snippets in value.items():
        normalized_key = _normalize_subcategory_value(raw_key)
        if not normalized_key or (allowed and normalized_key not in allowed):
            continue
        if isinstance(raw_snippets, list):
            snippets = raw_snippets
        else:
            snippets = [raw_snippets]
        cleaned = []
        for snippet in snippets:
            text = _clean_snippet(snippet)
            if text and text not in cleaned:
                cleaned.append(text)
        if cleaned:
            evidence[normalized_key] = cleaned[:4]
    return evidence


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

    subcategories = _parse_subcategory_list(payload.get("subcategories"), fallback_main=main_category)
    if not subcategories:
        subcategories = [f"{main_category}/{subcategory}"]
    if len(subcategories) > 6:
        subcategories = subcategories[:6]

    issue_subcategories = _parse_subcategory_list(payload.get("issue_subcategories"), fallback_main=main_category)
    request_subcategories = _parse_subcategory_list(payload.get("request_subcategories"), fallback_main=main_category)
    if len(issue_subcategories) > 6:
        issue_subcategories = issue_subcategories[:6]
    if len(request_subcategories) > 6:
        request_subcategories = request_subcategories[:6]

    for entry in issue_subcategories + request_subcategories:
        if entry not in subcategories:
            subcategories.append(entry)

    for entry in subcategories:
        if entry.startswith(f"{main_category}/"):
            subcategory = entry.split("/", 1)[1]
            break

    issue_subcategories = [entry for entry in issue_subcategories if entry in subcategories]
    request_subcategories = [entry for entry in request_subcategories if entry in subcategories]
    evidence = _parse_evidence(payload.get("evidence"), subcategories)

    return {
        "main_category": main_category,
        "subcategory": subcategory,
        "subcategories": subcategories,
        "issue_subcategories": issue_subcategories,
        "request_subcategories": request_subcategories,
        "evidence": evidence,
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
        df_labeled = df.copy()
        df_labeled["llm_main_category"] = pd.Series(dtype="object")
        df_labeled["llm_subcategory"] = pd.Series(dtype="object")
        df_labeled["llm_subcategories"] = pd.Series(dtype="object")
        df_labeled["llm_issue_subcategories"] = pd.Series(dtype="object")
        df_labeled["llm_request_subcategories"] = pd.Series(dtype="object")
        df_labeled["llm_subcategory_evidence"] = pd.Series(dtype="object")
        df_labeled["llm_has_issue"] = pd.Series(dtype="bool")
        df_labeled["llm_has_request"] = pd.Series(dtype="bool")
        return df_labeled

    df_labeled = df.copy()
    key_series = df_labeled["review_id"]

    def _get_value(rid: str, field: str, default: Any = None) -> Any:
        entry = labels.get(rid, {})
        payload = entry.get("payload", {})
        value = payload.get(field, default)
        if field in ("subcategories", "issue_subcategories", "request_subcategories"):
            return list(value) if isinstance(value, list) else default
        if field == "evidence":
            return value if isinstance(value, dict) else default
        return value

    # Add V10 columns
    df_labeled["llm_main_category"] = key_series.map(lambda rid: _get_value(rid, "main_category", "other"))
    df_labeled["llm_subcategory"] = key_series.map(lambda rid: _get_value(rid, "subcategory", "general"))
    df_labeled["llm_subcategories"] = key_series.map(lambda rid: _get_value(rid, "subcategories", []))
    df_labeled["llm_issue_subcategories"] = key_series.map(lambda rid: _get_value(rid, "issue_subcategories", []))
    df_labeled["llm_request_subcategories"] = key_series.map(lambda rid: _get_value(rid, "request_subcategories", []))
    df_labeled["llm_subcategory_evidence"] = key_series.map(lambda rid: _get_value(rid, "evidence", {}))
    df_labeled["llm_has_issue"] = df_labeled["llm_issue_subcategories"].apply(
        lambda value: isinstance(value, list) and len(value) > 0
    )
    df_labeled["llm_has_request"] = df_labeled["llm_request_subcategories"].apply(
        lambda value: isinstance(value, list) and len(value) > 0
    )

    return df_labeled
