"""Local Ollama-powered review classification helpers."""
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
PROMPT_VERSION = "steam_review_insights_v10_subcategory_only"
ACTIVE_PROMPT_VERSION = PROMPT_VERSION
MAX_REVIEW_CHARS = 3000

_PROMPT_TEMPLATE = Template(
    dedent(
        """Extract actionable developer insights from Steam reviews. Reply with STRICT YAML only — no prose, no code fences.

        GAME CONTEXT:
        Name: $game_name
        Type: $game_type
        Genres: $game_genres
        Categories: $game_categories
        Description: $game_description

        REVIEWER CONTEXT:
        Playtime: $reviewer_playtime hours
        Recommendation: $reviewer_recommendation

        YAML SCHEMA (use these exact keys):
        main_category: gameplay | technical | content | interface | social | monetization | other
        subcategory: <primary subcategory for main_category, see hierarchy below>
        subcategories: [list of "<main>/<sub>" strings, 1-6 items]
        issue_subcategories: [subset of subcategories that describe problems]
        request_subcategories: [subset of subcategories that describe explicit requests]
        evidence: { "<main>/<sub>": ["short quote from review (<=140 chars)"] }

        HIERARCHICAL TAXONOMY (7 main categories):

        1. gameplay:
           - mechanics: combat, movement, puzzles, systems depth, game feel, core loop
           - controls: input mapping, controller/KBM, responsiveness, camera behavior
           - balance: difficulty curve, fairness, PvE/PvP balance, skill ceiling
           - progression: leveling, unlocks, rewards, grind, experience gain

        2. technical:
           - performance: FPS drops, stuttering, frame pacing, optimization
           - stability: crashes, freezes, save corruption, game-breaking bugs
           - bugs: glitches, physics issues, broken features, clipping
           - compatibility: platform issues, hardware requirements, Steam Deck

        3. content:
           - quantity: too short, not enough content, lack of levels/missions
           - variety: repetitive, lack of diversity, same enemies/environments
           - quality: story quality, writing, level design, mission design
           - replayability: endgame content, replay value, post-game activities

        4. interface:
           - usability: confusing UI, menu navigation, control scheme clarity
           - accessibility: colorblind modes, subtitles, difficulty options
           - tutorial: onboarding, learning curve, explanations, tooltips
           - audio_visual: graphics quality, art style, sound design, music

        5. social:
           - multiplayer: servers, netcode, matchmaking, co-op, online features
           - community: toxicity, player behavior, moderation, forums
           - support: developer communication, bug reports, community management

        6. monetization:
           - pricing: base game price, regional pricing, sales, bundles
           - dlc: DLC quality, pricing, value proposition, cut content
           - microtransactions: MTX, loot boxes, pay-to-win, cosmetics
           - value: worth the money, content per dollar, price justification

        7. other:
           - general: vague praise or criticism without specifics
           - mixed: multiple unrelated issues across categories
           - unclear: cannot determine category

        LABELING RULES:
        - Pick ONE main_category (the dominant theme in the review)
        - Pick ONE subcategory within that main_category (primary)
        - Add 1-6 subcategories across all topics using "<main>/<sub>" format
        - issue_subcategories must be a subset of subcategories with problems
        - request_subcategories must be a subset of subcategories with explicit requests
        - Provide at least one short evidence snippet for each subcategory
        - If review is vague/generic: main_category=other, subcategory=general, subcategories=["other/general"],
          issue_subcategories=[], request_subcategories=[], evidence={"other/general":["short quote"]}
        - Respond with single YAML document. No backticks, no commentary.

        REVIEW:
          text: $review_literal

        YAML RESPONSE EXAMPLES:

        Example 1 (Technical issues):
        main_category: technical
        subcategory: performance
        subcategories:
          - technical/performance
        issue_subcategories:
          - technical/performance
        request_subcategories: []
        evidence:
          technical/performance:
            - "Frame rate drops to 15 FPS during boss fights"

        Example 2 (Vague review):
        main_category: other
        subcategory: general
        subcategories:
          - other/general
        issue_subcategories: []
        request_subcategories: []
        evidence:
          other/general:
            - "pretty fun overall"

        Example 3 (Balance issue with request):
        main_category: gameplay
        subcategory: balance
        subcategories:
          - gameplay/balance
        issue_subcategories:
          - gameplay/balance
        request_subcategories:
          - gameplay/balance
        evidence:
          gameplay/balance:
            - "boss Malenia too difficult in second phase"
            - "need easier mode"
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
        game_type = game_context.get("type", "game")
        genres = game_context.get("genres", [])
        categories = game_context.get("categories", [])
        description = game_context.get("short_description", "")[:200]  # Limit description length

        game_genres = ", ".join(genres) if genres else "Unknown"
        game_categories = ", ".join(categories[:5]) if categories else "Unknown"  # Limit to 5
        game_description = description if description else "Not available"
    else:
        game_name = "Unknown"
        game_type = "game"
        game_genres = "Unknown"
        game_categories = "Unknown"
        game_description = "Not available"

    # Format playtime
    playtime_hours = round(reviewer_playtime / 60, 1) if reviewer_playtime else 0
    recommendation = "Positive" if reviewer_voted_up else "Negative"

    return _PROMPT_TEMPLATE.substitute(
        review_literal=review_literal,
        game_name=game_name,
        game_type=game_type,
        game_genres=game_genres,
        game_categories=game_categories,
        game_description=game_description,
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
        content = (content_value or "").strip()

    if not content:
        raise ValueError("Empty response from Ollama")

    return content


def _parse_payload(raw: str) -> Dict[str, Any]:
    if not raw:
        raise ValueError("Empty response from Ollama")

    try:
        documents = list(yaml.safe_load_all(raw))
    except yaml.YAMLError as exc:
        raise ValueError(f"Invalid YAML from Ollama: {exc}") from exc

    data: Optional[Dict[str, Any]] = None
    for doc in documents:
        if isinstance(doc, dict):
            data = doc
            break

    if not data:
        raise ValueError(f"No YAML mapping found in Ollama response: {raw!r}")

    payload = data

    # Main category
    main_category = payload.get("main_category", "other")
    if not isinstance(main_category, str) or main_category not in _ALLOWED_MAIN_CATEGORIES:
        main_category = "other"

    # Subcategory (validate against main category)
    subcategory = payload.get("subcategory", "")
    if not isinstance(subcategory, str):
        subcategory = ""

    allowed_subs = _ALLOWED_SUBCATEGORIES.get(main_category, set())
    if subcategory not in allowed_subs:
        # Fallback to first allowed subcategory for this main category
        subcategory = next(iter(allowed_subs)) if allowed_subs else "general"

    # Multi-label subcategories (canonical format "main/sub")
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

    # Ensure issue/request tags are represented in subcategories
    for entry in issue_subcategories + request_subcategories:
        if entry not in subcategories:
            subcategories.append(entry)

    # Align primary subcategory with the dominant main category when possible
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


def classify_review(
    review_text: str,
    game_context: Optional[Dict[str, Any]] = None,
    reviewer_playtime: float = 0,
    reviewer_voted_up: bool = True,
) -> Tuple[Dict[str, Any], str]:
    clean_text = (review_text or "").strip()
    if not clean_text:
        return _DEFAULT_LABEL.copy(), "fallback"

    prompt = _build_prompt(clean_text, game_context, reviewer_playtime, reviewer_voted_up)
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
    game_context: Optional[Dict[str, Any]] = None,
    cache_enabled: bool = True,
) -> Dict[str, Dict[str, Any]]:
    if not reviews:
        if progress_callback is not None:
            progress_callback(0, 0)
        return {}

    existing = storage.load_review_labels(app_id) if cache_enabled else {}
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
            if cached.get("prompt_version") != ACTIVE_PROMPT_VERSION:
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
                    ACTIVE_PROMPT_VERSION,
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

        # Extract reviewer context from review
        reviewer_playtime = review.get("author", {}).get("playtime_forever", 0)
        reviewer_voted_up = review.get("voted_up", True)

        payload, model_used = classify_review(
            review_text,
            game_context=game_context,
            reviewer_playtime=reviewer_playtime,
            reviewer_voted_up=reviewer_voted_up,
        )
        if cache_enabled:
            storage.upsert_review_label(app_id, review_id, review_hash, payload, model_used, ACTIVE_PROMPT_VERSION)
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
        df_labeled["llm_main_category"] = pd.Series(dtype="object")
        df_labeled["llm_subcategory"] = pd.Series(dtype="object")
        df_labeled["llm_subcategories"] = pd.Series(dtype="object")
        df_labeled["llm_issue_subcategories"] = pd.Series(dtype="object")
        df_labeled["llm_request_subcategories"] = pd.Series(dtype="object")
        df_labeled["llm_subcategory_evidence"] = pd.Series(dtype="object")
        df_labeled["llm_has_issue"] = pd.Series(dtype="bool")
        df_labeled["llm_has_request"] = pd.Series(dtype="bool")
        return df_labeled

    key_series = df_labeled["review_id"].astype(str)

    def _get_value(review_id: str, key: str, default: Any) -> Any:
        payload = labels.get(review_id)
        if not payload:
            return default
        value = payload.get(key, default)
        if key in ("subcategories", "issue_subcategories", "request_subcategories"):
            if isinstance(value, list):
                return list(value)
            return default
        if key == "evidence":
            return value if isinstance(value, dict) else default
        return default if value is None else value

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


__all__ = [
    "apply_review_labels",
    "classify_review",
    "ensure_review_labels",
]
