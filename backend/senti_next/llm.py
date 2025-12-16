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
FAST_CLASSIFIER_ENABLED = os.getenv("SENTINEXT_FAST_CLASSIFIER", "true").lower() in {"1", "true", "yes"}
FAST_CONFIDENCE_THRESHOLD = float(os.getenv("SENTINEXT_FAST_CONFIDENCE", "0.78"))
LLM_DISABLED = os.getenv("SENTINEXT_DISABLE_LLM", "false").lower() in {"1", "true", "yes"}
PROMPT_VERSION = "steam_review_insights_v8_standardized"
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
        subcategory: <depends on main_category, see hierarchy below>
        issues: [list of standardized issue objects, 0-5 items]
        feature_requests: [list of standardized request objects, 0-5 items]
        urgency: critical | high | medium | low

        ISSUE OBJECT FORMAT:
        - category: <standardized category from taxonomy below>
          severity: critical | high | medium | low
          example: "<optional: specific instance from review>"

        FEATURE REQUEST OBJECT FORMAT:
        - category: <standardized category from taxonomy below>
          demand: high | medium | low
          example: "<optional: how player described it>"

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

        STANDARDIZED ISSUE CATEGORIES (choose from these):

        GAMEPLAY: boss_difficulty, combat_difficulty_too_hard, combat_difficulty_too_easy,
                  combat_balance, combat_mechanics_broken, movement_controls, controls_unintuitive,
                  progression_too_slow, progression_too_fast, grind_excessive, rewards_unsatisfying,
                  game_too_short, content_repetitive, pacing_issues, endgame_lacking

        TECHNICAL: fps_drops, loading_times, optimization_poor, crashes_frequent, crashes_on_launch,
                   freezes, save_corruption, progression_blocked, bugs_visual, bugs_audio,
                   bugs_gameplay, bugs_quest, ai_broken, platform_specific, steam_deck_issues

        CONTENT: story_quality_poor, writing_quality_poor, story_too_short, level_design_poor,
                 mission_design_poor, mission_variety_lacking, graphics_quality_poor, graphics_blurry,
                 audio_quality_poor, music_quality_poor

        INTERFACE: ui_confusing, ui_cluttered, menu_clunky, inventory_system_bad, map_issues,
                   accessibility_lacking, tutorial_poor, tutorial_too_long, text_too_small

        SOCIAL: servers_unstable, matchmaking_broken, netcode_poor, multiplayer_imbalanced,
                cheaters_prevalent, toxic_community, poor_communication

        MONETIZATION: price_too_high, dlc_overpriced, dlc_should_be_free, poor_value,
                      mtx_predatory, pay_to_win, cosmetics_overpriced

        FEATURE REQUEST CATEGORIES (choose from these):

        GAMEPLAY: difficulty_options_wanted, easy_mode_wanted, hard_mode_wanted, new_game_plus_wanted,
                  new_weapons_wanted, new_abilities_wanted, respec_option_wanted, transmog_wanted

        CONTENT: more_story_wanted, more_missions_wanted, more_endgame_wanted, new_areas_wanted,
                 more_bosses_wanted, randomizer_mode_wanted

        QOL: ui_customization_wanted, better_map_wanted, quest_tracking_wanted, fast_travel_wanted,
             skip_cutscenes_wanted, photo_mode_wanted, pause_in_menus_wanted

        SOCIAL: coop_mode_wanted, pvp_mode_wanted, crossplay_wanted, mod_support_wanted

        TECHNICAL: graphics_options_wanted, performance_mode_wanted, fov_slider_wanted,
                   ultrawide_support_wanted

        LABELING RULES:
        - Pick ONE main_category (the dominant theme in the review)
        - Pick ONE subcategory within that main_category
        - Extract 0-5 ISSUES using standardized categories above
        - Extract 0-5 FEATURE REQUESTS using standardized categories above
        - For each issue/request, optionally add a specific example from the review
        - Overall urgency: critical/high/medium/low based on most severe issue
        - Be liberal with extraction: if reviewer mentions "bosses are too hard", add boss_difficulty issue
        - Group similar problems: "boss 1 too hard" + "boss 2 too hard" = ONE boss_difficulty issue
        - Severity levels:
          * critical = game-breaking (crashes, save corruption, unplayable)
          * high = major impact (progression blocked, severe bugs, broken mechanics)
          * medium = noticeable problems (annoying bugs, balance issues)
          * low = minor issues, polish, suggestions
        - Demand levels for requests:
          * high = strongly desired, frequently mentioned
          * medium = nice to have
          * low = minor suggestion
        - If review is vague/generic: main_category=other, subcategory=general, issues=[], feature_requests=[], urgency=low
        - Consider game genre when classifying issues
        - Respond with single YAML document. No backticks, no commentary.

        REVIEW:
          text: $review_literal

        YAML RESPONSE EXAMPLES:

        Example 1 (Technical issues):
        main_category: technical
        subcategory: performance
        issues:
          - category: fps_drops
            severity: high
            example: "Frame rate drops to 15 FPS during boss fights"
          - category: optimization_poor
            severity: high
            example: "city areas with many NPCs cause stuttering"
        feature_requests: []
        urgency: high

        Example 2 (Vague review):
        main_category: other
        subcategory: general
        issues: []
        feature_requests: []
        urgency: low

        Example 3 (Balance issue with feature request):
        main_category: gameplay
        subcategory: balance
        issues:
          - category: boss_difficulty
            severity: high
            example: "boss Malenia too difficult in second phase"
          - category: combat_balance
            severity: medium
            example: "player damage too low"
        feature_requests:
          - category: difficulty_options_wanted
            demand: high
            example: "need easier mode"
        urgency: high
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


_FAST_KEYWORDS = {
    "technical": {
        "performance": ["fps", "stutter", "lag", "frame", "optimiz", "performance", "drop"],
        "stability": ["crash", "freeze", "hang", "stuck", "save corrupt"],
        "bugs": ["bug", "glitch", "broken", "clip", "collision"],
    },
    "gameplay": {
        "balance": ["balance", "op", "overpowered", "unbalanced", "too hard", "too easy", "boss"],
        "controls": ["control", "input", "camera", "controller", "kbm", "mouse"],
        "progression": ["grind", "progression", "level", "xp", "reward", "loot"],
    },
    "content": {
        "quantity": ["short", "no content", "lack content", "empty", "little content"],
        "variety": ["repetitive", "same", "variety", "repeat"],
        "quality": ["story", "writing", "narrative", "quest", "mission design"],
    },
    "interface": {
        "usability": ["ui", "interface", "menu", "inventory", "hud"],
        "tutorial": ["tutorial", "onboarding", "explain", "teach"],
        "accessibility": ["subtitle", "colorblind", "difficulty option"],
    },
    "social": {
        "multiplayer": ["multiplayer", "coop", "co-op", "pvp", "matchmaking", "server"],
        "community": ["toxic", "community"],
    },
    "monetization": {
        "pricing": ["price", "expensive", "overpriced"],
        "dlc": ["dlc"],
        "microtransactions": ["mtx", "microtransaction", "loot box", "battle pass"],
    },
}


def _fast_classify_review(review_text: str) -> Tuple[Optional[Dict[str, Any]], float]:
    """Lightweight heuristic classifier to avoid heavy LLM calls when confident."""
    text = (review_text or "").lower()
    if not text.strip():
        return None, 0.0

    scores: Dict[str, Dict[str, int]] = {cat: {} for cat in _ALLOWED_MAIN_CATEGORIES}

    for main_cat, submap in _FAST_KEYWORDS.items():
        for subcat, keywords in submap.items():
            for kw in keywords:
                if kw in text:
                    scores[main_cat][subcat] = scores[main_cat].get(subcat, 0) + 1

    # Pick main/sub with highest hits
    best_main = None
    best_sub = None
    best_score = 0
    for main_cat, sub_scores in scores.items():
        for subcat, score in sub_scores.items():
            if score > best_score:
                best_score = score
                best_main = main_cat
                best_sub = subcat

    if not best_main or best_score == 0:
        return None, 0.0

    urgency = "medium"
    if any(term in text for term in ("crash", "save corrupt", "unplayable")):
        urgency = "critical"
    elif any(term in text for term in ("broken", "cannot", "unusable", "freeze")):
        urgency = "high"
    elif any(term in text for term in ("minor", "small", "nitpick")):
        urgency = "low"

    feature_requests: list[dict] = []
    if any(term in text for term in ("wish", "would love", "add", "need", "please add", "want")):
        feature_requests.append({"category": "feature_request", "demand": "medium", "example": ""})

    payload = {
        "main_category": best_main,
        "subcategory": best_sub,
        "issues": [],
        "feature_requests": feature_requests,
        "feature_request": bool(feature_requests),
        "urgency": urgency,
    }

    confidence = min(1.0, 0.5 + 0.1 * best_score)
    return payload, confidence


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

    # Feature request flag will be derived from structured requests
    feature_request = False

    # Urgency
    urgency = payload.get("urgency", "low")
    if urgency not in _ALLOWED_URGENCIES:
        urgency = "low"

    # Parse issues (v8: structured objects with category, severity, example)
    issues_value = payload.get("issues") or []
    issues: list[dict] = []
    if isinstance(issues_value, list):
        for item in issues_value:
            if isinstance(item, dict):
                # New format: {category: "boss_difficulty", severity: "high", example: "..."}
                category = item.get("category", "")
                severity = item.get("severity", "medium")
                example = item.get("example", "")
                if category:
                    issues.append({
                        "category": str(category).strip(),
                        "severity": severity if severity in _ALLOWED_URGENCIES else "medium",
                        "example": str(example).strip() if example else ""
                    })
            elif isinstance(item, str):
                # Defensive: allow plain string to propagate
                issue_text = item.strip()
                if issue_text:
                    issues.append({
                        "category": "other",
                        "severity": "medium",
                        "example": issue_text
                    })
            if len(issues) >= 5:
                break

    # Parse feature requests (v8: structured objects)
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
                        "demand": demand if demand in {"high", "medium", "low"} else "medium",
                        "example": str(example).strip() if example else ""
                    })
            if len(feature_requests) >= 5:
                break

    # Boolean convenience flag derived from structured requests
    feature_request = len(feature_requests) > 0

    return {
        "main_category": main_category,
        "subcategory": subcategory,
        "issues": issues,
        "feature_requests": feature_requests,
        "feature_request": feature_request,
        "urgency": urgency,
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

    if FAST_CLASSIFIER_ENABLED:
        fast_payload, confidence = _fast_classify_review(clean_text)
        if fast_payload and confidence >= FAST_CONFIDENCE_THRESHOLD:
            return fast_payload, "fast_classifier"

    if LLM_DISABLED:
        return _DEFAULT_LABEL.copy(), "disabled"

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
        df_labeled["llm_issues"] = pd.Series(dtype="object")
        df_labeled["llm_feature_requests"] = pd.Series(dtype="object")
        df_labeled["llm_feature_request"] = pd.Series(dtype="bool")
        df_labeled["llm_urgency"] = pd.Series(dtype="object")
        # Backward compatibility
        df_labeled["llm_specific_issues"] = pd.Series(dtype="object")
        return df_labeled

    key_series = df_labeled["review_id"].astype(str)

    def _get_value(review_id: str, key: str, default: Any) -> Any:
        payload = labels.get(review_id)
        if not payload:
            return default
        value = payload.get(key, default)
        if key in ("issues", "feature_requests"):
            if isinstance(value, list):
                return list(value)
            return default
        if key == "feature_request":
            return bool(value)
        return default if value is None else value

    df_labeled["llm_main_category"] = key_series.map(lambda rid: _get_value(rid, "main_category", "other"))
    df_labeled["llm_subcategory"] = key_series.map(lambda rid: _get_value(rid, "subcategory", "general"))
    df_labeled["llm_issues"] = key_series.map(lambda rid: _get_value(rid, "issues", []))
    df_labeled["llm_feature_requests"] = key_series.map(lambda rid: _get_value(rid, "feature_requests", []))
    df_labeled["llm_feature_request"] = key_series.map(lambda rid: _get_value(rid, "feature_request", False))
    df_labeled["llm_urgency"] = key_series.map(lambda rid: _get_value(rid, "urgency", "low"))

    # Provide human-readable issue examples derived from structured payload
    def _extract_examples(issues_list):
        if not isinstance(issues_list, list):
            return []
        return [issue.get("example", issue.get("category", "")) for issue in issues_list if isinstance(issue, dict)]

    df_labeled["llm_specific_issues"] = df_labeled["llm_issues"].apply(_extract_examples)

    return df_labeled


__all__ = [
    "apply_review_labels",
    "classify_review",
    "ensure_review_labels",
]
