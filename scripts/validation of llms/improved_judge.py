"""Improved LLM evaluation with numeric scoring.

Approach:
- Ask judge for 5 numeric scores (0-100) matching classifier output structure
- Compute weighted average with primary > subcategories > issues > evidence > requests
- Simple, interpretable, captures nuance
"""
from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional, Tuple


TAXONOMY = """TAXONOMY (valid categories):
- gameplay: mechanics, controls, balance, difficulty, progression, ai
- technical: performance, bugs, stability, crashes, compatibility, networking, installation
- content_design: amount_variety, level_design, quests_modes, narrative_characters, replayability, pacing, customization
- ui_ux_accessibility: menus_hud, readability, quality_of_life, controller_support, accessibility_options
- onboarding: tutorial, learning_curve, clarity, tooltips
- presentation: visuals_art_style, animation, audio_music_voice, atmosphere, localization
- online_community: multiplayer_experience, matchmaking, social_features, toxicity_moderation, mods_ugc, cheating_anti_cheat
- developer_updates: patch_quality, update_frequency, roadmap_events, communication, customer_support
- monetization_value: price, regional_pricing, dlc, microtransactions, pay_to_win_grind, value_for_money
- other: general, mixed, meta, unclear"""


DEFAULT_WEIGHTS = {
    "primary": 0.30,
    "subcategories": 0.25,
    "issues": 0.20,
    "evidence": 0.15,
    "requests": 0.10,
}


def build_judge_prompt(review_text: str, predicted: Dict[str, Any]) -> str:
    """Build judge prompt asking for 5 numeric scores."""

    evidence = predicted.get("evidence", {})
    evidence_str = "\n".join(
        f"    {cat}: {quotes}" for cat, quotes in evidence.items()
    ) if evidence else "    (none)"

    subcategories = predicted.get("subcategories", [])
    primary = subcategories[0] if subcategories else "(none)"

    return f"""You are evaluating a Steam review classification. Rate each dimension 0-100.

{TAXONOMY}

REVIEW:
\"\"\"{review_text}\"\"\"

CLASSIFICATION:
- primary (first subcategory): {primary}
- subcategories: {subcategories}
- issue_subcategories: {predicted.get("issue_subcategories", [])}
- request_subcategories: {predicted.get("request_subcategories", [])}
- evidence:
{evidence_str}

SCORING GUIDELINES:
- 90-100: Excellent - correct and complete
- 70-89: Good - mostly correct, minor issues
- 50-69: Partial - some correct, some wrong or missing
- 30-49: Poor - significant errors
- 0-29: Very poor - mostly or completely wrong

Rate each dimension:
1. primary: Is "{primary}" the DOMINANT theme of this review?
2. subcategories: Are all predicted subcategories correct? Are important themes missing?
3. issues: Are issue_subcategories correctly identifying complaints/problems in the review?
4. requests: Are request_subcategories correctly identifying EXPLICIT requests (e.g., "please add", "I wish")?
5. evidence: Do the quotes actually appear in the review and support their categories?

Return ONLY valid JSON:
{{"primary": <0-100>, "subcategories": <0-100>, "issues": <0-100>, "requests": <0-100>, "evidence": <0-100>}}"""


def parse_judge_response(response_text: str) -> Dict[str, float]:
    """Parse judge response, extracting numeric scores."""

    # Try direct JSON parse
    try:
        result = json.loads(response_text)
        if isinstance(result, dict):
            return {k: float(v) for k, v in result.items() if k in DEFAULT_WEIGHTS}
    except json.JSONDecodeError:
        pass

    # Try to extract JSON from response
    json_match = re.search(r"\{[^{}]+\}", response_text)
    if json_match:
        try:
            result = json.loads(json_match.group(0))
            if isinstance(result, dict):
                return {k: float(v) for k, v in result.items() if k in DEFAULT_WEIGHTS}
        except (json.JSONDecodeError, ValueError):
            pass

    # Fallback: extract numbers with regex
    scores = {}
    for key in DEFAULT_WEIGHTS:
        pattern = rf'"{key}"\s*:\s*(\d+(?:\.\d+)?)'
        match = re.search(pattern, response_text)
        if match:
            scores[key] = float(match.group(1))

    return scores


def compute_total(scores: Dict[str, float], weights: Optional[Dict[str, float]] = None) -> float:
    """Compute weighted average score."""

    if weights is None:
        weights = DEFAULT_WEIGHTS

    total = 0.0
    weight_sum = 0.0

    for key, weight in weights.items():
        if key in scores:
            total += scores[key] * weight
            weight_sum += weight

    # Normalize if some scores are missing
    if weight_sum > 0 and weight_sum < 1.0:
        total = total / weight_sum

    return round(total, 2)


def evaluate_review(
    review_text: str,
    predicted: Dict[str, Any],
    judge_fn,
    weights: Optional[Dict[str, float]] = None,
) -> Dict[str, Any]:
    """
    Evaluate a single review classification.

    Args:
        review_text: The original review text
        predicted: The classifier's output (subcategories, issues, requests, evidence)
        judge_fn: Function that takes a prompt and returns judge's response text
        weights: Optional custom weights for scoring

    Returns:
        Dict with scores for each dimension and total
    """

    prompt = build_judge_prompt(review_text, predicted)
    response = judge_fn(prompt)
    scores = parse_judge_response(response)

    # Ensure all dimensions have a score (default to 0 if missing)
    for key in DEFAULT_WEIGHTS:
        if key not in scores:
            scores[key] = 0.0

    scores["total"] = compute_total(scores, weights)

    return scores


def aggregate_results(all_scores: List[Dict[str, float]]) -> Dict[str, Any]:
    """Compute aggregate statistics across all evaluated reviews."""

    if not all_scores:
        return {}

    n = len(all_scores)
    keys = list(DEFAULT_WEIGHTS.keys()) + ["total"]

    aggregates = {}
    for key in keys:
        values = [s.get(key, 0) for s in all_scores]
        aggregates[key] = {
            "mean": round(sum(values) / n, 2),
            "min": round(min(values), 2),
            "max": round(max(values), 2),
        }

    # Score distribution
    totals = [s.get("total", 0) for s in all_scores]
    aggregates["distribution"] = {
        "excellent_90_100": sum(1 for t in totals if t >= 90),
        "good_70_89": sum(1 for t in totals if 70 <= t < 90),
        "partial_50_69": sum(1 for t in totals if 50 <= t < 70),
        "poor_30_49": sum(1 for t in totals if 30 <= t < 50),
        "very_poor_0_29": sum(1 for t in totals if t < 30),
    }

    return aggregates


# =============================================================================
# Integration with validate_live_llm.py
# =============================================================================

def integrate_with_validator():
    """
    Example of how to use this in validate_live_llm.py:

    ```python
    from improved_judge import (
        build_judge_prompt,
        parse_judge_response,
        compute_total,
        aggregate_results,
        DEFAULT_WEIGHTS,
    )

    # Replace _judge_prompt with:
    prompt = build_judge_prompt(review_text, predicted)

    # Replace _compute_score with:
    if args.judge_provider == "openai":
        response = _openai_judge_raw(prompt, args.judge_model, args.openai_base_url)
    else:
        response = _google_judge_raw(prompt, args.judge_model)

    scores = parse_judge_response(response)
    scores["total"] = compute_total(scores)

    # At the end, aggregate:
    summary = aggregate_results(all_scores)
    ```
    """
    pass
